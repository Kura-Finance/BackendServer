"use strict";
/**
 * Plaid Webhook 同步服務
 * 處理由 webhook 觸發的交易與投資資料同步
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidWebhookSyncService = void 0;
const plaidClientFactory_1 = require("../lib/plaidClientFactory");
const prisma_1 = require("../../shared/lib/prisma");
const plaidCacheUtil_1 = require("../lib/plaidCacheUtil");
const logger_1 = require("../../logger");
const plaidDataTransformer_1 = require("../lib/plaidDataTransformer");
const plaidAuthService_1 = require("./plaidAuthService");
const plaidTransactionService_1 = require("./plaidTransactionService");
const crypto_1 = require("../../shared/crypto");
const payloadKeyService_1 = require("../../shared/services/payloadKeyService");
const plaidPayloadBuilder_1 = require("../lib/plaidPayloadBuilder");
const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';
/**
 * 嘗試為一個 scope 建立 payloadKey。
 * Phase 3 Zero-Access only：使用者沒 keypair → 直接拋（caller 會 skip sync）。
 */
async function createPayloadKey(userId, scope) {
    try {
        return await payloadKeyService_1.PayloadKeyService.createForUser(userId, scope);
    }
    catch (error) {
        if (error instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
            logger_1.appLogger.warn('User has no E2EE key pair — webhook sync skipped. ' +
                'Client must POST /api/auth/keys/setup before webhook syncs can succeed.', { userId, scope });
        }
        else {
            (0, logger_1.logError)('Failed to create payload key for webhook sync', error, { userId, scope });
        }
        throw error;
    }
}
class PlaidWebhookSyncService {
    /**
     * 從 Webhook 觸發的交易同步
     */
    static async syncTransactionsFromWebhook(userId, itemId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Syncing transactions from webhook', { userId, itemId });
            const userPlaidClient = (0, plaidClientFactory_1.createPlaidClientForUser)(userId);
            const prismaAny = prisma_1.prisma;
            const plaidItem = await prismaAny.plaidItem.findUnique({
                where: { itemId },
            });
            if (!plaidItem || plaidItem.userId !== userId) {
                throw new Error('Plaid item not found or access denied');
            }
            const { decryptedAccessToken } = plaidAuthService_1.PlaidAuthService.decryptPlaidItem(plaidItem);
            const transactionSync = await plaidTransactionService_1.PlaidTransactionService.fetchTransactions(userPlaidClient, decryptedAccessToken, plaidItem.transactionsCursor ?? undefined);
            // 過濾投資相關的交易，只保留 banking
            const bankingTransactions = transactionSync.transactions.filter((tx) => {
                const accountMeta = transactionSync.accountsMetadata.get(tx.accountId);
                if (!accountMeta)
                    return false;
                return (0, plaidDataTransformer_1.classifyPlaidAccountBucket)(accountMeta.type, accountMeta.subtype) === 'banking';
            });
            // ── 為這次 webhook sync 建立一把 SEK（Phase 3：必須有 keypair）──
            const txPayloadKey = await createPayloadKey(userId, `plaid_tx:${plaidItem.id}`);
            try {
                const formattedTransactions = bankingTransactions.map((tx) => {
                    const split = (0, plaidPayloadBuilder_1.splitTransaction)(tx, plaidItem.id);
                    return {
                        accountId: split.metadata.accountId,
                        transactionId: split.metadata.transactionId,
                        plaidItemId: split.metadata.plaidItemId ?? plaidItem.id,
                        date: split.metadata.date,
                        month: split.metadata.month,
                        isPending: split.metadata.isPending,
                        isRecurring: split.metadata.isRecurring,
                        isSubscription: split.metadata.isSubscription,
                        payloadCiphertext: (0, crypto_1.encryptPayload)(txPayloadKey.sek, split.sensitive),
                        payloadKeyId: txPayloadKey.payloadKeyId,
                    };
                });
                // All writes go through one transaction so the cursor never advances
                // ahead of the rows it commits. 60 s timeout is comfortably above the
                // observed upper bound for the largest single-webhook delta.
                await prisma_1.prisma.$transaction(async (tx) => {
                    if (transactionSync.removedTransactionIds.length > 0) {
                        await tx.plaidTransactionCache.deleteMany({
                            where: {
                                userId,
                                transactionId: { in: transactionSync.removedTransactionIds },
                            },
                        });
                    }
                    await (0, plaidCacheUtil_1.upsertTransactionsCache)(userId, formattedTransactions, tx);
                    if (transactionSync.nextCursor) {
                        const txAny = tx;
                        await txAny.plaidItem.update({
                            where: { id: plaidItem.id },
                            data: { transactionsCursor: transactionSync.nextCursor },
                        });
                    }
                    await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'transactions', undefined, tx);
                }, { timeout: 60_000, maxWait: 10_000 });
                const duration = Date.now() - startTime;
                (0, logger_1.logPerformance)('sync_transactions_webhook', duration, 5000);
                (0, logger_1.logBusinessEvent)('plaid_transactions_synced_webhook', userId, {
                    itemId,
                    transactionCount: formattedTransactions.length,
                    removedCount: transactionSync.removedTransactionIds.length,
                });
                (0, logger_1.logDebug)('Transactions synced from webhook', {
                    userId,
                    itemId,
                    transactionCount: formattedTransactions.length,
                    removedCount: transactionSync.removedTransactionIds.length,
                });
            }
            finally {
                (0, crypto_1.zeroize)(txPayloadKey.sek);
            }
        }
        catch (error) {
            (0, logger_1.logError)('Failed to sync transactions from webhook', error, {
                userId,
                itemId,
            });
        }
    }
    /**
     * 從 Webhook 觸發的投資數據同步
     */
    static async syncInvestmentsFromWebhook(userId, itemId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Syncing investments from webhook', { userId, itemId });
            const userPlaidClient = (0, plaidClientFactory_1.createPlaidClientForUser)(userId);
            const plaidItem = await prisma_1.prisma.plaidItem.findUnique({
                where: { itemId },
            });
            if (!plaidItem || plaidItem.userId !== userId) {
                throw new Error('Plaid item not found or access denied');
            }
            const { decryptedAccessToken } = plaidAuthService_1.PlaidAuthService.decryptPlaidItem(plaidItem);
            const accountsResponse = await userPlaidClient.accountsGet({
                access_token: decryptedAccessToken,
            });
            const investmentAccounts = accountsResponse.data.accounts.filter((account) => account.type === 'investment' || (account.subtype && account.subtype.includes('investment')));
            if (investmentAccounts.length === 0) {
                (0, logger_1.logDebug)('No investment accounts found', { userId, itemId });
                return;
            }
            const holdingsResponse = await userPlaidClient.investmentsHoldingsGet({
                access_token: decryptedAccessToken,
            });
            const holdings = holdingsResponse.data.holdings;
            const securities = holdingsResponse.data.securities;
            // ── 為這次 webhook sync 建立兩把 SEK（投資帳戶 / 投資持倉）──
            const invAcctKey = await createPayloadKey(userId, `plaid_inv_acct:${plaidItem.id}`);
            const invKey = await createPayloadKey(userId, `plaid_inv:${plaidItem.id}`);
            try {
                const formattedInvestmentAccounts = investmentAccounts.map((account) => {
                    const fakePayload = {
                        id: account.account_id,
                        name: `${plaidItem.institutionName} · ${account.name}`,
                        type: 'Broker',
                        logo: PLAID_FALLBACK_LOGO,
                    };
                    const split = (0, plaidPayloadBuilder_1.splitInvestmentAccount)(fakePayload);
                    return {
                        accountId: split.metadata.accountId,
                        payloadCiphertext: (0, crypto_1.encryptPayload)(invAcctKey.sek, split.sensitive),
                        payloadKeyId: invAcctKey.payloadKeyId,
                    };
                });
                const formattedInvestments = holdings.map((holding) => {
                    const security = securities.find((s) => s.security_id === holding.security_id);
                    const ticker = security?.ticker_symbol || 'N/A';
                    const name = security?.name || holding.security_id;
                    const quantity = Number(holding.quantity || 0);
                    const institutionPrice = Number(holding.institution_price || 0);
                    const institutionValue = Number(holding.institution_value || 0);
                    const fallbackPrice = quantity > 0 ? institutionValue / quantity : 0;
                    const effectivePrice = institutionPrice > 0 ? institutionPrice : fallbackPrice;
                    const investmentType = security?.type === 'equity' ? 'stock' : 'other';
                    const sensitive = {
                        symbol: ticker,
                        name,
                        holdings: quantity,
                        currentPrice: effectivePrice,
                        logo: PLAID_FALLBACK_LOGO,
                    };
                    return {
                        investmentId: `${holding.account_id}-${holding.security_id}`,
                        accountId: holding.account_id,
                        type: investmentType,
                        payloadCiphertext: (0, crypto_1.encryptPayload)(invKey.sek, sensitive),
                        payloadKeyId: invKey.payloadKeyId,
                    };
                });
                await (0, plaidCacheUtil_1.upsertInvestmentAccountsCache)(userId, formattedInvestmentAccounts);
                await (0, plaidCacheUtil_1.upsertInvestmentsCache)(userId, formattedInvestments);
                await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'investments');
                const duration = Date.now() - startTime;
                (0, logger_1.logPerformance)('sync_investments_webhook', duration, 5000);
                (0, logger_1.logBusinessEvent)('plaid_investments_synced_webhook', userId, {
                    itemId,
                    investmentCount: formattedInvestments.length,
                });
                (0, logger_1.logDebug)('Investments synced from webhook', {
                    userId,
                    itemId,
                    investmentCount: formattedInvestments.length,
                });
            }
            finally {
                (0, crypto_1.zeroize)(invAcctKey.sek);
                (0, crypto_1.zeroize)(invKey.sek);
            }
        }
        catch (error) {
            (0, logger_1.logError)('Failed to sync investments from webhook', error, {
                userId,
                itemId,
            });
        }
    }
}
exports.PlaidWebhookSyncService = PlaidWebhookSyncService;
//# sourceMappingURL=plaidWebhookSyncService.js.map