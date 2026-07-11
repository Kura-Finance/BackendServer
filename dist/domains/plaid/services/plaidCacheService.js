"use strict";
/**
 * Plaid 快取服務
 * 協調快取、同步與財務快照相關操作
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidCacheService = void 0;
const plaidClientFactory_1 = require("../lib/plaidClientFactory");
const prisma_1 = require("../../shared/lib/prisma");
const plaidCacheUtil_1 = require("../lib/plaidCacheUtil");
const apiRateLimitUtil_1 = require("../../shared/lib/apiRateLimitUtil");
const symbolsAndExchangesUtil_1 = require("../../shared/lib/symbolsAndExchangesUtil");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const plaidAccountService_1 = require("./plaidAccountService");
const plaidTransactionService_1 = require("./plaidTransactionService");
const plaidInvestmentService_1 = require("./plaidInvestmentService");
const plaidAuthService_1 = require("./plaidAuthService");
const assetService_1 = require("../../asset/services/assetService");
const fieldEncryption_1 = require("../../shared/lib/fieldEncryption");
const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';
class PlaidCacheService {
    /**
     * 獲取財務快照（優化版-支持緩存）
     * 優先使用緩存，必要時調用 API
     */
    static async getFinanceSnapshotOptimized(userId, isManualRefresh = false) {
        const cacheStartTime = Date.now();
        // 只有手動刷新才檢查限制，自動刷新不受限制
        if (isManualRefresh) {
            const refreshCheck = await (0, apiRateLimitUtil_1.checkApiLimit)(userId, 'plaid_refresh');
            if (!refreshCheck.canOperate) {
                const tier = await (0, apiRateLimitUtil_1.getUserTier)(userId);
                const refreshLimit = (0, apiRateLimitUtil_1.getApiLimitForTier)('plaid_refresh', tier);
                const error = new Error(`Daily refresh limit reached. ${tier} users can refresh ${refreshLimit} times per day. ${refreshCheck.message}`);
                error.statusCode = 429;
                error.refreshLimit = refreshLimit;
                error.refreshCountRemaining = 0;
                throw error;
            }
            (0, logger_1.logDebug)('User has refresh quota available', {
                userId,
                refreshCountRemaining: refreshCheck.operationCountRemaining,
                refreshLimit: refreshCheck.operationLimit,
            });
        }
        const forceRefresh = isManualRefresh;
        // 檢查快取狀態
        const shouldRefreshAccounts = forceRefresh || (await (0, plaidCacheUtil_1.shouldRefreshAccountsCache)(userId));
        const shouldRefreshTransactions = forceRefresh || (await (0, plaidCacheUtil_1.shouldRefreshTransactionsCache)(userId));
        const shouldRefreshInvestments = forceRefresh || (await (0, plaidCacheUtil_1.shouldRefreshInvestmentsCache)(userId));
        (0, logger_1.logDebug)('Cache status check', {
            userId,
            forceRefresh,
            shouldRefreshAccounts,
            shouldRefreshTransactions,
            shouldRefreshInvestments,
        });
        // 若所有快取都未過期且不是強制刷新，直接從快取取得
        if (!forceRefresh && !shouldRefreshAccounts && !shouldRefreshTransactions && !shouldRefreshInvestments) {
            (0, logger_1.logDebug)('Using cached data', { userId });
            return this.getSnapshotFromCache(userId);
        }
        // 從 Plaid API 取得資料
        (0, logger_1.logDebug)('Fetching fresh data from Plaid API', { userId, forceRefresh });
        const snapshot = await this.getFinanceSnapshot(userId);
        // 如果是手動刷新，記錄此次操作（計入每日限制）
        if (isManualRefresh) {
            try {
                await (0, apiRateLimitUtil_1.recordApiOperation)(userId, 'plaid_refresh');
                (0, logger_1.logDebug)('Recorded manual refresh', { userId });
            }
            catch (error) {
                logger_1.appLogger.warn('Failed to record refresh', { userId, error });
            }
        }
        // 非同步保存到快取，不阻塞回應
        this.saveFinanceSnapshotToCache(userId, snapshot).catch((error) => {
            logger_1.appLogger.warn('Failed to save finance snapshot to cache', {
                userId,
                error: error.message,
            });
        });
        const apiDuration = Date.now() - cacheStartTime;
        (0, logger_1.logPerformance)('get_finance_snapshot_api', apiDuration, 5000);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched_from_api', userId, {
            source: 'api',
            isManualRefresh,
            accountCount: snapshot.accounts.length,
            transactionCount: snapshot.transactions.length,
            investmentAccountCount: snapshot.investmentAccounts.length,
            investmentCount: snapshot.investments.length,
        });
        return snapshot;
    }
    /**
     * 從緩存取得財務快照
     */
    static async getSnapshotFromCache(userId) {
        const cacheStartTime = Date.now();
        const [cachedAccounts, cachedTransactions, cachedInvestmentAccounts, cachedInvestments, user] = await Promise.all([
            (0, plaidCacheUtil_1.getAccountsFromCache)(userId),
            (0, plaidCacheUtil_1.getTransactionsFromCache)(userId),
            (0, plaidCacheUtil_1.getInvestmentAccountsFromCache)(userId),
            (0, plaidCacheUtil_1.getInvestmentsFromCache)(userId),
            prisma_1.prisma.user.findUnique({
                where: { id: userId },
            }),
        ]);
        const accounts = cachedAccounts.map((acc) => {
            const account = {
                id: acc.accountId,
                name: acc.name,
                balance: fieldEncryption_1.FieldEncryption.decryptNumber(acc.balance),
                type: acc.type,
                logo: acc.logo,
            };
            if (acc.plaidLogo) {
                account.plaidLogo = acc.plaidLogo;
            }
            const apy = fieldEncryption_1.FieldEncryption.decryptOptionalNumber(acc.apy);
            if (apy !== undefined) {
                account.apy = apy;
            }
            const mask = fieldEncryption_1.FieldEncryption.decryptOptionalString(acc.mask);
            if (mask) {
                account.mask = mask;
            }
            return account;
        });
        const accountLookup = new Map(accounts.map((account) => [account.id, { name: account.name, type: account.type }]));
        const transactions = cachedTransactions.map((tx) => {
            const accountMeta = accountLookup.get(tx.accountId);
            const transaction = {
                id: tx.transactionId,
                accountId: tx.accountId,
                accountName: accountMeta?.name || tx.accountId,
                accountType: accountMeta?.type || 'N/A',
                amount: tx.amount,
                date: tx.date,
                merchant: tx.merchant,
                category: tx.category,
                type: tx.type,
                personalFinanceCategory: tx.personalFinanceCategory,
                isRecurring: tx.isRecurring,
                recurringFrequency: tx.recurringFrequency,
                isSubscription: tx.isSubscription,
                enrichedMerchantName: tx.enrichedMerchantName,
                merchantLogo: tx.merchantLogo,
                merchantCategory: tx.merchantCategory,
                isPending: tx.isPending,
            };
            if (tx.plaidMerchantLogo) {
                transaction.plaidMerchantLogo = tx.plaidMerchantLogo;
            }
            return transaction;
        });
        const investmentAccounts = cachedInvestmentAccounts.map((acc) => {
            const invAcc = {
                id: acc.accountId,
                name: acc.name,
                type: 'Broker',
                logo: acc.logo,
            };
            if (acc.plaidLogo) {
                invAcc.plaidLogo = acc.plaidLogo;
            }
            return invAcc;
        });
        const investments = cachedInvestments.map((inv) => {
            const investmentType = inv.type || 'stock';
            return {
                id: inv.investmentId,
                accountId: inv.accountId,
                symbol: inv.symbol,
                name: inv.name,
                holdings: fieldEncryption_1.FieldEncryption.decryptNumber(inv.holdings),
                currentPrice: fieldEncryption_1.FieldEncryption.decryptNumber(inv.currentPrice),
                change24h: inv.change24h || 0,
                type: investmentType,
                logo: (0, symbolsAndExchangesUtil_1.getStockLogoUrl)(inv.symbol),
            };
        });
        const cachedDuration = Date.now() - cacheStartTime;
        (0, logger_1.logPerformance)('get_finance_snapshot_cached', cachedDuration, 100);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched_from_cache', userId, {
            source: 'cache',
            accountCount: accounts.length,
            transactionCount: transactions.length,
            investmentAccountCount: investmentAccounts.length,
            investmentCount: investments.length,
        });
        return {
            accounts,
            transactions,
            investmentAccounts,
            investments,
        };
    }
    /**
     * 取得完整財務快照（從 Plaid API）
     */
    static async getFinanceSnapshot(userId) {
        const startTime = Date.now();
        (0, logger_1.logDebug)('Fetching finance snapshot', { userId });
        const userPlaidClient = (0, plaidClientFactory_1.createPlaidClientForUser)(userId);
        const prismaAny = prisma_1.prisma;
        const plaidItems = await prismaAny.plaidItem.findMany({
            where: { userId },
            select: {
                id: true,
                itemId: true,
                accessToken: true,
                transactionsCursor: true,
                institutionName: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
        });
        if (plaidItems.length === 0) {
            (0, logger_1.logDebug)('No Plaid items found for user', { userId });
            return {
                accounts: [],
                transactions: [],
                investmentAccounts: [],
                investments: [],
            };
        }
        const accounts = [];
        const transactions = [];
        const investmentAccounts = [];
        const investments = [];
        // 並行處理每個 Plaid 項目（Item）
        for (const item of plaidItems) {
            try {
                const { decryptedAccessToken } = plaidAuthService_1.PlaidAuthService.decryptPlaidItem({ accessToken: item.accessToken, itemId: item.itemId });
                // 並行獲取帳戶、交易、投資數據
                const [accountData, transactionData, investmentData] = await Promise.all([
                    plaidAccountService_1.PlaidAccountService.fetchAccountsWithAPY(userPlaidClient, item, decryptedAccessToken),
                    plaidTransactionService_1.PlaidTransactionService.fetchTransactions(userPlaidClient, decryptedAccessToken, item.transactionsCursor ?? undefined),
                    plaidInvestmentService_1.PlaidInvestmentService.fetchInvestmentHoldings(userPlaidClient, item, decryptedAccessToken),
                ]);
                accounts.push(...accountData.bankingAccounts);
                investmentAccounts.push(...accountData.investmentAccounts);
                transactions.push(...transactionData.transactions);
                investmentAccounts.push(...investmentData.investmentAccounts);
                investments.push(...investmentData.investments);
                if (transactionData.nextCursor) {
                    await prismaAny.plaidItem.update({
                        where: { id: item.id },
                        data: { transactionsCursor: transactionData.nextCursor },
                    });
                }
            }
            catch (error) {
                logger_1.appLogger.warn('Failed to fetch data for Plaid item', {
                    error: error.response?.data || error.message || error,
                    plaidItemId: item.id,
                    userId,
                });
            }
        }
        // 去重並排序
        const dedupedAccounts = Array.from(new Map(accounts.map((acc) => [acc.id, acc])).values());
        const dedupedTransactions = Array.from(new Map(transactions.map((tx) => [String(tx.id), tx])).values()).sort((a, b) => (a.date < b.date ? 1 : -1));
        const dedupedInvestmentAccounts = Array.from(new Map(investmentAccounts.map((acc) => [acc.id, acc])).values());
        const dedupedInvestments = Array.from(new Map(investments.map((inv) => [inv.id, inv])).values());
        const duration = Date.now() - startTime;
        (0, logger_1.logPerformance)('get_finance_snapshot', duration, 5000);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched', userId, {
            accountCount: dedupedAccounts.length,
            transactionCount: dedupedTransactions.length,
            investmentAccountCount: dedupedInvestmentAccounts.length,
            investmentCount: dedupedInvestments.length,
        });
        // 記錄審計日誌
        auditLog_1.AuditLogger.logPlaidOperation('FETCH_SNAPSHOT', userId, 'SUCCESS', undefined, {
            accountCount: dedupedAccounts.length,
            transactionCount: dedupedTransactions.length,
            investmentAccountCount: dedupedInvestmentAccounts.length,
            investmentCount: dedupedInvestments.length,
        }, undefined, duration);
        return {
            accounts: dedupedAccounts,
            transactions: dedupedTransactions,
            investmentAccounts: dedupedInvestmentAccounts,
            investments: dedupedInvestments,
        };
    }
    /**
     * 將財務快照保存到緩存
     */
    static async saveFinanceSnapshotToCache(userId, snapshot) {
        const syncLog = await (0, plaidCacheUtil_1.getOrCreateSyncLog)(userId);
        try {
            // 保存帳戶數據
            if (snapshot.accounts.length > 0) {
                const accountsToCache = snapshot.accounts.map((acc) => {
                    const account = {
                        plaidItemId: '',
                        accountId: acc.id,
                        name: acc.name,
                        balance: fieldEncryption_1.FieldEncryption.encryptNumber(acc.balance),
                        type: 'bank',
                        bucket: 'banking',
                        institutionName: acc.name.split('·')[0]?.trim() || 'Bank',
                        logo: acc.logo,
                    };
                    if (acc.plaidLogo) {
                        account.plaidLogo = acc.plaidLogo;
                    }
                    if (acc.apy !== undefined) {
                        account.apy = fieldEncryption_1.FieldEncryption.encryptOptionalNumber(acc.apy);
                    }
                    if (acc.mask) {
                        account.mask = fieldEncryption_1.FieldEncryption.encryptString(acc.mask);
                    }
                    return account;
                });
                await (0, plaidCacheUtil_1.upsertAccountsCache)(userId, accountsToCache);
                await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'accounts', { total: accountsToCache.length });
                // 帳戶同步完成後，非同步寫入 AssetSnapshot 以支援折線圖歷史
                assetService_1.AssetService.recordMultipleSnapshots(userId, snapshot.accounts.map((acc) => ({
                    assetId: acc.id,
                    name: acc.name,
                    type: 'bank_account',
                    value: acc.balance,
                }))).catch((err) => {
                    logger_1.appLogger.warn('Failed to record bank asset snapshots', { userId, error: err?.message });
                });
            }
            // 保存交易數據
            if (snapshot.transactions.length > 0) {
                const transactionsToCache = plaidTransactionService_1.PlaidTransactionService.formatTransactionsForCache(snapshot.transactions);
                await (0, plaidCacheUtil_1.upsertTransactionsCache)(userId, transactionsToCache);
                await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'transactions', { total: transactionsToCache.length });
            }
            // 保存投資帳戶數據
            if (snapshot.investmentAccounts.length > 0) {
                const investmentAccountsToCache = snapshot.investmentAccounts.map((acc) => {
                    const invAcc = {
                        accountId: acc.id,
                        name: acc.name,
                        institutionName: acc.name.split('·')[0]?.trim() || 'Broker',
                        logo: acc.logo,
                    };
                    if (acc.plaidLogo) {
                        invAcc.plaidLogo = acc.plaidLogo;
                    }
                    return invAcc;
                });
                await (0, plaidCacheUtil_1.upsertInvestmentAccountsCache)(userId, investmentAccountsToCache);
            }
            // 保存投資持倉數據
            if (snapshot.investments.length > 0) {
                const investmentsToCache = snapshot.investments.map((inv) => ({
                    accountId: inv.accountId,
                    investmentId: inv.id,
                    symbol: inv.symbol,
                    name: inv.name,
                    holdings: fieldEncryption_1.FieldEncryption.encryptNumber(inv.holdings),
                    currentPrice: fieldEncryption_1.FieldEncryption.encryptNumber(inv.currentPrice),
                    change24h: inv.change24h,
                    type: inv.type,
                    logo: inv.logo,
                }));
                await (0, plaidCacheUtil_1.upsertInvestmentsCache)(userId, investmentsToCache);
                await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'investments', { total: investmentsToCache.length });
                // 投資持倉同步完成後，非同步寫入 AssetSnapshot
                assetService_1.AssetService.recordMultipleSnapshots(userId, snapshot.investments.map((inv) => ({
                    assetId: inv.id,
                    name: `${inv.symbol} (${inv.name})`,
                    type: 'investment',
                    value: inv.holdings * inv.currentPrice,
                }))).catch((err) => {
                    logger_1.appLogger.warn('Failed to record investment asset snapshots', { userId, error: err?.message });
                });
            }
            (0, logger_1.logDebug)('Saved finance snapshot to cache', {
                userId,
                accounts: snapshot.accounts.length,
                transactions: snapshot.transactions.length,
                investmentAccounts: snapshot.investmentAccounts.length,
                investments: snapshot.investments.length,
            });
        }
        catch (error) {
            logger_1.appLogger.warn('Error saving to cache', { userId, error });
            throw error;
        }
    }
}
exports.PlaidCacheService = PlaidCacheService;
//# sourceMappingURL=plaidCacheService.js.map