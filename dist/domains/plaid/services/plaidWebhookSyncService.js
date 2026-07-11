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
const fieldEncryption_1 = require("../../shared/lib/fieldEncryption");
const plaidTransactionService_1 = require("./plaidTransactionService");
const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';
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
            const formattedTransactions = plaidTransactionService_1.PlaidTransactionService
                .formatTransactionsForCache(transactionSync.transactions)
                .filter((tx) => {
                const accountMeta = transactionSync.accountsMetadata.get(tx.accountId);
                if (!accountMeta) {
                    return false;
                }
                return (0, plaidDataTransformer_1.classifyPlaidAccountBucket)(accountMeta.type, accountMeta.subtype) === 'banking';
            });
            await (0, plaidCacheUtil_1.upsertTransactionsCache)(userId, formattedTransactions, transactionSync.removedTransactionIds);
            if (transactionSync.nextCursor) {
                await prismaAny.plaidItem.update({
                    where: { id: plaidItem.id },
                    data: { transactionsCursor: transactionSync.nextCursor },
                });
            }
            await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'transactions');
            const duration = Date.now() - startTime;
            (0, logger_1.logPerformance)('sync_transactions_webhook', duration, 5000);
            (0, logger_1.logBusinessEvent)('plaid_transactions_synced_webhook', userId, {
                itemId,
                transactionCount: formattedTransactions.length,
            });
            (0, logger_1.logDebug)('Transactions synced from webhook', {
                userId,
                itemId,
                transactionCount: formattedTransactions.length,
            });
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
                    holdings: fieldEncryption_1.FieldEncryption.encryptNumber(Number(holding.quantity || 0)),
                    currentPrice: fieldEncryption_1.FieldEncryption.encryptNumber(Number(security?.close_price || 0)),
                    type: security?.type === 'equity' ? 'stock' : 'other',
                    logo: PLAID_FALLBACK_LOGO,
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