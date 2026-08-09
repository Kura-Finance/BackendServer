/**
 * Plaid webhook sync service — transaction and investment sync from webhooks.
 */

import { Prisma } from '@prisma/client';
import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import {
  upsertTransactionsCache,
  upsertInvestmentAccountsCache,
  upsertInvestmentsCache,
  updateSyncTimestamp,
} from '../lib/plaidCacheUtil';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug } from '../../logger';
import { classifyPlaidAccountBucket } from '../lib/plaidDataTransformer';
import { PlaidAuthService } from './plaidAuthService';
import { PlaidTransactionService } from './plaidTransactionService';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
  PayloadKeyHandle,
  PayloadKeyDb,
} from '../../shared/services/payloadKeyService';
import {
  splitTransaction,
  splitInvestmentAccount,
  InvestmentSensitive,
} from '../lib/plaidPayloadBuilder';

function plaidFallbackLogo(): string {
  const csv = process.env.ALLOWED_ORIGINS || '';
  for (const part of csv.split(',')) {
    const o = part.trim();
    if (!o || o.startsWith('android:')) continue;
    try {
      const host = new URL(o).hostname.replace(/^www\./i, '');
      if (host) {
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
      }
    } catch {
      /* try next */
    }
  }
  return 'https://www.google.com/s2/favicons?domain=localhost&sz=128';
}

const PLAID_FALLBACK_LOGO = plaidFallbackLogo();

/**
 * Create a payloadKey for a scope.
 * Phase 3 Zero-Access only: no keypair → throw (caller skips sync).
 *
 * Pass `db` (outer transaction client) so EncryptedPayloadKey and referencing
 * cache rows commit/rollback together — avoids orphan keys and GC races.
 */
async function createPayloadKey(
  userId: string,
  scope: string,
  db: PayloadKeyDb = prisma,
): Promise<PayloadKeyHandle> {
  try {
    return await PayloadKeyService.createForUser(userId, scope, db);
  } catch (error) {
    if (error instanceof KeyPairNotConfiguredError) {
      appLogger.warn(
        'User has no E2EE key pair — webhook sync skipped. ' +
        'Client must POST /api/auth/keys/setup before webhook syncs can succeed.',
        { userId, scope },
      );
    } else {
      logError('Failed to create payload key for webhook sync', error, { userId, scope });
    }
    throw error;
  }
}

export class PlaidWebhookSyncService {
  /**
   * Transaction sync triggered by a webhook.
   */
  static async syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void> {
    const startTime = Date.now();
    try {
      logDebug('Syncing transactions from webhook', { userId, itemId });

      const userPlaidClient = createPlaidClientForUser(userId);

      const prismaAny = prisma as any;

      const plaidItem = await prismaAny.plaidItem.findUnique({
        where: { itemId },
      });

      if (!plaidItem || plaidItem.userId !== userId) {
        throw new Error('Plaid item not found or access denied');
      }

      const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem(plaidItem);

      const transactionSync = await PlaidTransactionService.fetchTransactions(
        userPlaidClient,
        decryptedAccessToken,
        plaidItem.transactionsCursor ?? undefined
      );

      // Keep banking transactions only (drop investment-related)
      const bankingTransactions = transactionSync.transactions.filter((tx) => {
        const accountMeta = transactionSync.accountsMetadata.get(tx.accountId);
        if (!accountMeta) return false;
        return classifyPlaidAccountBucket(accountMeta.type, accountMeta.subtype) === 'banking';
      });

      // ── SEK create + all writes in one transaction (Phase 3: keypair required) ──
      // Key row, cache rows, and cursor advance commit/rollback together so the
      // cursor never races ahead of written rows and keys do not become orphans.
      const sekHandles: PayloadKeyHandle[] = [];
      let transactionCount = 0;
      try {
        await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // Item may be disconnected during webhook handling; cached plaidItemId
            // is an FK — re-check inside the transaction before writing.
            const stillExists = await tx.plaidItem.findUnique({ where: { id: plaidItem.id }, select: { id: true } });
            if (!stillExists) {
              appLogger.warn('Plaid item removed during webhook tx sync — skipping cache write', { userId, itemId });
              return;
            }

            const txPayloadKey = await createPayloadKey(userId, `plaid_tx:${plaidItem.id}`, tx);
            sekHandles.push(txPayloadKey);

            const formattedTransactions = bankingTransactions.map((bankTx) => {
              const split = splitTransaction(bankTx, plaidItem.id);
              return {
                accountId: split.metadata.accountId,
                transactionId: split.metadata.transactionId,
                plaidItemId: split.metadata.plaidItemId ?? plaidItem.id,
                date: split.metadata.date,
                month: split.metadata.month,
                isPending: split.metadata.isPending,
                isRecurring: split.metadata.isRecurring,
                isSubscription: split.metadata.isSubscription,
                payloadCiphertext: encryptPayload(txPayloadKey.sek, split.sensitive),
                payloadKeyId: txPayloadKey.payloadKeyId,
              };
            });
            transactionCount = formattedTransactions.length;

            if (transactionSync.removedTransactionIds.length > 0) {
              await tx.plaidTransactionCache.deleteMany({
                where: {
                  userId,
                  transactionId: { in: transactionSync.removedTransactionIds },
                },
              });
            }

            await upsertTransactionsCache(userId, formattedTransactions, tx);

            if (transactionSync.nextCursor) {
              const txAny = tx as unknown as { plaidItem: { update: (args: { where: { id: string }; data: { transactionsCursor: string } }) => Promise<unknown> } };
              await txAny.plaidItem.update({
                where: { id: plaidItem.id },
                data: { transactionsCursor: transactionSync.nextCursor },
              });
            }

            await updateSyncTimestamp(userId, 'transactions', undefined, tx);
          },
          { timeout: 60_000, maxWait: 10_000 },
        );

        const duration = Date.now() - startTime;
        logPerformance('sync_transactions_webhook', duration, 5000);
        logBusinessEvent('plaid_transactions_synced_webhook', userId, {
          itemId,
          transactionCount,
          removedCount: transactionSync.removedTransactionIds.length,
        });

        logDebug('Transactions synced from webhook', {
          userId,
          itemId,
          transactionCount,
          removedCount: transactionSync.removedTransactionIds.length,
        });

        try {
          await PayloadKeyService.deleteOrphanedKeys(userId);
        } catch (gcError) {
          appLogger.warn('Failed to GC orphaned payload keys after webhook tx sync', {
            userId,
            error: gcError instanceof Error ? gcError.message : gcError,
          });
        }
      } finally {
        sekHandles.forEach((handle) => zeroize(handle.sek));
      }
    } catch (error) {
      logError('Failed to sync transactions from webhook', error, {
        userId,
        itemId,
      });
    }
  }

  /**
   * Investment sync triggered by a webhook.
   */
  static async syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void> {
    const startTime = Date.now();
    try {
      logDebug('Syncing investments from webhook', { userId, itemId });

      const userPlaidClient = createPlaidClientForUser(userId);

      const plaidItem = await prisma.plaidItem.findUnique({
        where: { itemId },
      });

      if (!plaidItem || plaidItem.userId !== userId) {
        throw new Error('Plaid item not found or access denied');
      }

      const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem(plaidItem);

      const accountsResponse = await userPlaidClient.accountsGet({
        access_token: decryptedAccessToken,
      });

      const investmentAccounts = accountsResponse.data.accounts.filter(
        (account) => account.type === 'investment' || (account.subtype && account.subtype.includes('investment')),
      );

      if (investmentAccounts.length === 0) {
        logDebug('No investment accounts found', { userId, itemId });
        return;
      }

      const holdingsResponse = await userPlaidClient.investmentsHoldingsGet({
        access_token: decryptedAccessToken,
      });

      const holdings = holdingsResponse.data.holdings;
      const securities = holdingsResponse.data.securities;

      // ── SEK create + all writes in one transaction ──
      // investmentAccounts / investments / syncTimestamp commit together so the
      // client never sees mismatched account vs holding counts.
      const sekHandles: PayloadKeyHandle[] = [];
      let investmentCount = 0;
      try {
        await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // Item may be disconnected during webhook handling; cached plaidItemId
            // is an FK — re-check inside the transaction before writing.
            const stillExists = await tx.plaidItem.findUnique({ where: { id: plaidItem.id }, select: { id: true } });
            if (!stillExists) {
              appLogger.warn('Plaid item removed during webhook investment sync — skipping cache write', { userId, itemId });
              return;
            }

            const invAcctKey = await createPayloadKey(userId, `plaid_inv_acct:${plaidItem.id}`, tx);
            const invKey = await createPayloadKey(userId, `plaid_inv:${plaidItem.id}`, tx);
            sekHandles.push(invAcctKey, invKey);

            const formattedInvestmentAccounts = investmentAccounts.map((account) => {
              const fakePayload = {
                id: account.account_id,
                name: `${plaidItem.institutionName} · ${account.name}`,
                type: 'Broker' as const,
                logo: PLAID_FALLBACK_LOGO,
              };
              const split = splitInvestmentAccount(fakePayload, plaidItem.id);
              return {
                plaidItemId: split.metadata.plaidItemId,
                accountId: split.metadata.accountId,
                payloadCiphertext: encryptPayload(invAcctKey.sek, split.sensitive),
                payloadKeyId: invAcctKey.payloadKeyId,
              };
            });

            const formattedInvestments = holdings.map((holding) => {
              const security = securities.find((s) => s.security_id === holding.security_id);
              const ticker = security?.ticker_symbol || 'N/A';
              const name = security?.name || holding.security_id;
              const quantity = Number(holding.quantity || 0);
              const institutionPrice = Number((holding as any).institution_price || 0);
              const institutionValue = Number((holding as any).institution_value || 0);
              const fallbackPrice = quantity > 0 ? institutionValue / quantity : 0;
              const effectivePrice = institutionPrice > 0 ? institutionPrice : fallbackPrice;
              const investmentType = security?.type === 'equity' ? 'stock' : 'other';

              const sensitive: InvestmentSensitive = {
                symbol: ticker,
                name,
                holdings: quantity,
                currentPrice: effectivePrice,
                logo: PLAID_FALLBACK_LOGO,
              };

              return {
                plaidItemId: plaidItem.id,
                investmentId: `${holding.account_id}-${holding.security_id}`,
                accountId: holding.account_id,
                type: investmentType,
                payloadCiphertext: encryptPayload(invKey.sek, sensitive),
                payloadKeyId: invKey.payloadKeyId,
              };
            });
            investmentCount = formattedInvestments.length;

            await upsertInvestmentAccountsCache(userId, formattedInvestmentAccounts, tx);
            await upsertInvestmentsCache(userId, formattedInvestments, tx);
            await updateSyncTimestamp(userId, 'investments', undefined, tx);
          },
          { timeout: 60_000, maxWait: 10_000 },
        );

        const duration = Date.now() - startTime;
        logPerformance('sync_investments_webhook', duration, 5000);
        logBusinessEvent('plaid_investments_synced_webhook', userId, {
          itemId,
          investmentCount,
        });

        logDebug('Investments synced from webhook', {
          userId,
          itemId,
          investmentCount,
        });

        // Webhook updates holdings cache only (no AssetSnapshot).
        // Clear investmentsSyncedAt so the next encrypted/optimized read refreshes history.
        try {
          await prisma.plaidSyncLog.updateMany({
            where: { userId },
            data: { investmentsSyncedAt: null },
          });
        } catch (expireError) {
          appLogger.warn('Failed to expire investments cache after webhook inv sync', {
            userId,
            error: expireError instanceof Error ? expireError.message : expireError,
          });
        }

        try {
          await PayloadKeyService.deleteOrphanedKeys(userId);
        } catch (gcError) {
          appLogger.warn('Failed to GC orphaned payload keys after webhook inv sync', {
            userId,
            error: gcError instanceof Error ? gcError.message : gcError,
          });
        }
      } finally {
        sekHandles.forEach((handle) => zeroize(handle.sek));
      }
    } catch (error) {
      logError('Failed to sync investments from webhook', error, {
        userId,
        itemId,
      });
    }
  }
}
