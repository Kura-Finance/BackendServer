"use strict";
/**
 * Plaid 交易服務
 * 處理交易資料讀取、分類與補強
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidTransactionService = void 0;
const logger_1 = require("../../logger");
const plaidDataTransformer_1 = require("../lib/plaidDataTransformer");
class PlaidTransactionService {
    static normalizeMerchantName(merchantName) {
        if (!merchantName) {
            return 'Unknown Merchant';
        }
        const raw = merchantName.trim();
        if (!raw) {
            return 'Unknown Merchant';
        }
        // 部分機構會把多個候選商戶名用分號串起來，優先取第一段可用值
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
        // 若第一段是敘述句，改抓 "Merchant name: xxx"
        if (!normalized || /^from\s+/i.test(normalized)) {
            const embeddedMerchant = raw.match(/merchant\s*name:\s*([^;]+)/i)?.[1]?.trim();
            if (embeddedMerchant) {
                normalized = embeddedMerchant;
            }
        }
        return normalized || raw;
    }
    static extractPlaidMerchantLogo(tx) {
        if (typeof tx.logo_url === 'string' && tx.logo_url.trim()) {
            return tx.logo_url.trim();
        }
        if (Array.isArray(tx.counterparties)) {
            const merchantCounterparty = tx.counterparties.find((counterparty) => counterparty &&
                counterparty.type === 'merchant' &&
                typeof counterparty.logo_url === 'string' &&
                counterparty.logo_url.trim());
            if (merchantCounterparty?.logo_url) {
                return merchantCounterparty.logo_url.trim();
            }
            const firstCounterpartyWithLogo = tx.counterparties.find((counterparty) => counterparty &&
                typeof counterparty.logo_url === 'string' &&
                counterparty.logo_url.trim());
            if (firstCounterpartyWithLogo?.logo_url) {
                return firstCounterpartyWithLogo.logo_url.trim();
            }
        }
        return undefined;
    }
    static async fetchTransactions(userPlaidClient, decryptedAccessToken, cursor) {
        const transactions = [];
        const removedTransactionIds = [];
        const accountsMetadata = new Map();
        try {
            let hasMore = true;
            let syncCursor = cursor;
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
            (0, logger_1.logDebug)('Fetched transactions via transactionsSync', {
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
        }
        catch (error) {
            (0, logger_1.logDebug)('Failed to fetch transactions via transactionsSync', {
                error: error.response?.data || error.message || error,
            });
        }
        return {
            transactions,
            removedTransactionIds,
            accountsMetadata,
        };
    }
    /**
     * 格式化單筆交易
     */
    static formatTransaction(tx, accountsMetadata) {
        const accountMeta = accountsMetadata.get(tx.account_id);
        const primaryCategory = tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized';
        const normalizedMerchant = this.normalizeMerchantName(tx.merchant_name || tx.name);
        // 識別定期交易和訂閱
        const { isSubscription, isRecurring } = this.identifyRecurringTransactions(primaryCategory, tx.merchant_name);
        const txPayload = {
            id: tx.transaction_id,
            accountId: tx.account_id,
            accountName: accountMeta?.name,
            accountType: (0, plaidDataTransformer_1.mapPlaidAccountType)(accountMeta?.type || 'depository', accountMeta?.subtype),
            amount: Number(Math.abs(tx.amount)).toFixed(2),
            date: tx.date,
            merchant: normalizedMerchant,
            category: primaryCategory,
            type: (0, plaidDataTransformer_1.mapPlaidTransactionType)(tx.amount, primaryCategory),
            // ===== 進階交易信息 =====
            personalFinanceCategory: primaryCategory,
            isRecurring: isRecurring,
        };
        // 只在有值時添加可選欄位
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
        // merchantLogo 完全以 Plaid 回傳為準，不再 fallback logo.dev
        if (plaidMerchantLogo) {
            txPayload.merchantLogo = plaidMerchantLogo;
            txPayload.plaidMerchantLogo = plaidMerchantLogo;
        }
        if (tx.pending) {
            txPayload.isPending = true;
        }
        return txPayload;
    }
    /**
     * 識別定期交易和訂閱
     */
    static identifyRecurringTransactions(primaryCategory, merchantName) {
        const isSubscriptionFlag = primaryCategory === 'SUBSCRIPTION_PAYMENT' ||
            primaryCategory === 'SUBSCRIPTION' ||
            !!(merchantName && (merchantName.toLowerCase().includes('subscription') ||
                merchantName.toLowerCase().includes('membership') ||
                merchantName.toLowerCase().includes('premium')));
        const isRecurringFlag = isSubscriptionFlag ||
            primaryCategory === 'SALARY' ||
            primaryCategory === 'PAYCHECK' ||
            primaryCategory === 'RENT' ||
            primaryCategory === 'UTILITIES';
        return { isSubscription: isSubscriptionFlag, isRecurring: isRecurringFlag };
    }
}
exports.PlaidTransactionService = PlaidTransactionService;
//# sourceMappingURL=plaidTransactionService.js.map