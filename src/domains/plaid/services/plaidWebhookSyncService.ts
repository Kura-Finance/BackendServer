/**
 * Plaid Webhook 同步服務
 * 處理由 webhook 觸發的交易與投資資料同步
 */

import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import { upsertTransactionsCache, upsertInvestmentAccountsCache, upsertInvestmentsCache, updateSyncTimestamp } from '../lib/plaidCacheUtil';
import { logError, logBusinessEvent, logPerformance, logDebug } from '../../logger';
import { classifyPlaidAccountBucket } from '../lib/plaidDataTransformer';
import { PlaidAuthService } from './plaidAuthService';
import { FieldEncryption } from '../../shared/lib/fieldEncryption';
import { PlaidTransactionService } from './plaidTransactionService';

const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';

export class PlaidWebhookSyncService {
  /**
   * 從 Webhook 觸發的交易同步
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
      const formattedTransactions = PlaidTransactionService
        .formatTransactionsForCache(transactionSync.transactions)
        .filter((tx) => {
          const accountMeta = transactionSync.accountsMetadata.get(tx.accountId);
          if (!accountMeta) {
            return false;
          }
          return classifyPlaidAccountBucket(accountMeta.type, accountMeta.subtype) === 'banking';
        });

      await upsertTransactionsCache(userId, formattedTransactions, transactionSync.removedTransactionIds);

      if (transactionSync.nextCursor) {
        await prismaAny.plaidItem.update({
          where: { id: plaidItem.id },
          data: { transactionsCursor: transactionSync.nextCursor },
        });
      }

      await updateSyncTimestamp(userId, 'transactions');

      const duration = Date.now() - startTime;
      logPerformance('sync_transactions_webhook', duration, 5000);
      logBusinessEvent('plaid_transactions_synced_webhook', userId, {
        itemId,
        transactionCount: formattedTransactions.length,
      });

      logDebug('Transactions synced from webhook', {
        userId,
        itemId,
        transactionCount: formattedTransactions.length,
      });
    } catch (error) {
      logError('Failed to sync transactions from webhook', error, {
        userId,
        itemId,
      });
    }
  }

  /**
   * 從 Webhook 觸發的投資數據同步
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

      const formattedInvestmentAccounts = investmentAccounts.map((account) => ({
        accountId: account.account_id,
        name: `${plaidItem.institutionName} · ${account.name}`,
        institutionName: plaidItem.institutionName,
        logo: PLAID_FALLBACK_LOGO,
      }));

      const formattedInvestments = holdings.map((holding) => {
        const security = securities.find((s) => s.security_id === holding.security_id);
        const ticker = security?.ticker_symbol || 'N/A';
        const name = security?.name || holding.security_id;

        return {
          investmentId: holding.security_id,
          accountId: holding.account_id,
          symbol: ticker,
          name,
          holdings: FieldEncryption.encryptNumber(Number(holding.quantity || 0)),
          currentPrice: FieldEncryption.encryptNumber(Number(security?.close_price || 0)),
          type: security?.type === 'equity' ? 'stock' : 'other',
          logo: PLAID_FALLBACK_LOGO,
        };
      });

      await upsertInvestmentAccountsCache(userId, formattedInvestmentAccounts);
      await upsertInvestmentsCache(userId, formattedInvestments);
      await updateSyncTimestamp(userId, 'investments');

      const duration = Date.now() - startTime;
      logPerformance('sync_investments_webhook', duration, 5000);
      logBusinessEvent('plaid_investments_synced_webhook', userId, {
        itemId,
        investmentCount: formattedInvestments.length,
      });

      logDebug('Investments synced from webhook', {
        userId,
        itemId,
        investmentCount: formattedInvestments.length,
      });
    } catch (error) {
      logError('Failed to sync investments from webhook', error, {
        userId,
        itemId,
      });
    }
  }
}
