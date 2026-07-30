/**
 * Plaid transaction service — sync fetch, classify, and enrich merchants.
 */

import { logDebug } from '../../logger';
import { PlaidTransactionPayload } from '../models/types';
import { mapPlaidTransactionType, mapPlaidAccountType } from '../lib/plaidDataTransformer';

export class PlaidTransactionService {
  private static normalizeMerchantName(merchantName?: string | null): string {
    if (!merchantName) {
      return 'Unknown Merchant';
    }

    const raw = merchantName.trim();
    if (!raw) {
      return 'Unknown Merchant';
    }

    // Some institutions join candidate names with ';'; prefer the first usable segment
    const firstSegment = raw
      .split(';')
      .map((segment) => segment.trim())
      .find((segment) => segment.length > 0) || raw;

    let normalized = firstSegment
      .replace(/^merchant\s*name:\s*/i, '')
      .replace(/\s+from\s+.+\s+via\s+.+$/i, '')
      .replace(/\s+via\s+.+$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If the first segment is a narrative, pull "Merchant name: xxx"
    if (!normalized || /^from\s+/i.test(normalized)) {
      const embeddedMerchant = raw.match(/merchant\s*name:\s*([^;]+)/i)?.[1]?.trim();
      if (embeddedMerchant) {
        normalized = embeddedMerchant;
      }
    }

    return normalized || raw;
  }

  private static extractPlaidMerchantLogo(tx: any): string | undefined {
    if (typeof tx.logo_url === 'string' && tx.logo_url.trim()) {
      return tx.logo_url.trim();
    }

    if (Array.isArray(tx.counterparties)) {
      const merchantCounterparty = tx.counterparties.find(
        (counterparty: any) =>
          counterparty &&
          counterparty.type === 'merchant' &&
          typeof counterparty.logo_url === 'string' &&
          counterparty.logo_url.trim()
      );
      if (merchantCounterparty?.logo_url) {
        return merchantCounterparty.logo_url.trim();
      }

      const firstCounterpartyWithLogo = tx.counterparties.find(
        (counterparty: any) =>
          counterparty &&
          typeof counterparty.logo_url === 'string' &&
          counterparty.logo_url.trim()
      );
      if (firstCounterpartyWithLogo?.logo_url) {
        return firstCounterpartyWithLogo.logo_url.trim();
      }
    }

    return undefined;
  }

  static async fetchTransactions(
    userPlaidClient: any,
    decryptedAccessToken: string,
    cursor?: string
  ): Promise<{
    transactions: PlaidTransactionPayload[];
    removedTransactionIds: string[];
    nextCursor?: string;
    accountsMetadata: Map<string, { name: string; type: string; subtype?: string | null }>;
  }> {
    const transactions: PlaidTransactionPayload[] = [];
    const removedTransactionIds: string[] = [];
    const accountsMetadata = new Map<string, { name: string; type: string; subtype?: string | null }>();

    try {
      let hasMore = true;
      let syncCursor: string | undefined = cursor;
      let pageCount = 0;

      while (hasMore) {
        const syncResponse = await userPlaidClient.transactionsSync({
          access_token: decryptedAccessToken,
          cursor: syncCursor,
          count: 500,
        });

        const { added = [], modified = [], removed = [], has_more = false, next_cursor } = syncResponse.data || {};

        for (const account of syncResponse.data?.accounts || []) {
          if (!accountsMetadata.has(account.account_id)) {
            accountsMetadata.set(account.account_id, {
              name: account.name || account.official_name || 'Plaid Account',
              type: account.type || 'depository',
              subtype: account.subtype ?? null,
            });
          }
        }

        for (const tx of [...added, ...modified]) {
          const txPayload = this.formatTransaction(tx, accountsMetadata);
          if (txPayload) {
            transactions.push(txPayload);
          }

          if (!accountsMetadata.has(tx.account_id)) {
            accountsMetadata.set(tx.account_id, {
              name: tx.account_owner || 'Plaid Account',
              type: 'depository',
              subtype: null,
            });
          }
        }

        for (const removedTx of removed) {
          if (removedTx?.transaction_id) {
            removedTransactionIds.push(removedTx.transaction_id);
          }
        }

        syncCursor = next_cursor;
        hasMore = Boolean(has_more);
        pageCount += 1;
      }

      logDebug('Fetched transactions via transactionsSync', {
        fetchedTransactions: transactions.length,
        removedTransactions: removedTransactionIds.length,
        pageCount,
      });

      return {
        transactions,
        removedTransactionIds,
        ...(syncCursor ? { nextCursor: syncCursor } : {}),
        accountsMetadata,
      };
    } catch (error: any) {
      logDebug('Failed to fetch transactions via transactionsSync', {
        error: error.response?.data || error.message || error,
      });
    }

    return {
      transactions,
      removedTransactionIds,
      accountsMetadata,
    };
  }

  /** Format a single Plaid transaction into app payload shape. */
  private static formatTransaction(
    tx: any,
    accountsMetadata: Map<string, { name: string; type: string; subtype?: string | null }>,
  ): PlaidTransactionPayload | null {
    const accountMeta = accountsMetadata.get(tx.account_id);
    const primaryCategory = tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized';
    const normalizedMerchant = this.normalizeMerchantName(tx.merchant_name || tx.name);

    const { isSubscription, isRecurring } = this.identifyRecurringTransactions(primaryCategory, tx.merchant_name);

    const txPayload: any = {
      id: tx.transaction_id,
      accountId: tx.account_id,
      accountName: accountMeta?.name,
      accountType: mapPlaidAccountType(accountMeta?.type || 'depository', accountMeta?.subtype),
      amount: Number(Math.abs(tx.amount)).toFixed(2),
      date: tx.date,
      merchant: normalizedMerchant,
      category: primaryCategory,
      type: mapPlaidTransactionType(tx.amount, primaryCategory),

      // ===== Enriched fields =====
      personalFinanceCategory: primaryCategory,
      isRecurring: isRecurring,
    };

    // Optional fields only when present
    if (isRecurring) {
      txPayload.recurringFrequency = 'MONTHLY';
    }
    if (isSubscription !== undefined) {
      txPayload.isSubscription = isSubscription;
    }
    const plaidMerchantLogo = this.extractPlaidMerchantLogo(tx);
    if (tx.merchant_name) {
      txPayload.enrichedMerchantName = normalizedMerchant;
    }

    // merchantLogo comes only from Plaid (no logo.dev fallback)
    if (plaidMerchantLogo) {
      txPayload.merchantLogo = plaidMerchantLogo;
      txPayload.plaidMerchantLogo = plaidMerchantLogo;
    }
    if (tx.pending) {
      txPayload.isPending = true;
    }

    return txPayload;
  }

  /** Detect recurring / subscription transactions from category and merchant. */
  private static identifyRecurringTransactions(
    primaryCategory: string,
    merchantName?: string | null,
  ): { isSubscription: boolean; isRecurring: boolean } {
    const isSubscriptionFlag: boolean =
      primaryCategory === 'SUBSCRIPTION_PAYMENT' ||
      primaryCategory === 'SUBSCRIPTION' ||
      !!(merchantName && (
        merchantName.toLowerCase().includes('subscription') ||
        merchantName.toLowerCase().includes('membership') ||
        merchantName.toLowerCase().includes('premium')
      ));

    const isRecurringFlag: boolean =
      isSubscriptionFlag ||
      primaryCategory === 'SALARY' ||
      primaryCategory === 'PAYCHECK' ||
      primaryCategory === 'RENT' ||
      primaryCategory === 'UTILITIES';

    return { isSubscription: isSubscriptionFlag, isRecurring: isRecurringFlag };
  }

  // formatTransactionsForCache removed in PR 5 — Phase 3 zero-access writes
  // go through `plaidPayloadBuilder.splitTransaction()` + SEK encryption.
}
