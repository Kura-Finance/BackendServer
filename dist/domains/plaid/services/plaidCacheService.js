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
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const plaidAccountService_1 = require("./plaidAccountService");
const plaidTransactionService_1 = require("./plaidTransactionService");
const plaidInvestmentService_1 = require("./plaidInvestmentService");
const plaidAuthService_1 = require("./plaidAuthService");
const assetService_1 = require("../../asset/services/assetService");
const crypto_1 = require("../../shared/crypto");
const payloadKeyService_1 = require("../../shared/services/payloadKeyService");
const plaidPayloadBuilder_1 = require("../lib/plaidPayloadBuilder");
class PlaidCacheService {
    /**
     * 取得「加密形式」財務快照（優化版－支持快取）。
     *
     * Phase 3 Zero-Access E2EE only：
     *   - 快取未過期 → 直接從 cache 撈加密 row（後端不解密）
     *   - 快取過期或 isManualRefresh → 從 Plaid API 抓明文 → 加密寫 cache → 從 cache 撈加密 row 回傳
     *
     * 後端在第二條路徑中**只在記憶體**短暫持有明文，立即 SEK 加密寫 DB 後 zeroize SEK。
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
        if (!forceRefresh && !shouldRefreshAccounts && !shouldRefreshTransactions && !shouldRefreshInvestments) {
            (0, logger_1.logDebug)('Using cached encrypted snapshot', { userId });
            return this.getEncryptedSnapshotFromCache(userId);
        }
        // 從 Plaid API 取得明文 → 加密寫 cache
        (0, logger_1.logDebug)('Fetching fresh data from Plaid API', { userId, forceRefresh });
        let fetchResult;
        try {
            fetchResult = await this.fetchPlaintextFromPlaid(userId);
            await this.saveFinanceSnapshotToCache(userId, fetchResult.snapshot, fetchResult.pendingCursorUpdates);
        }
        catch (error) {
            if (error instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
                // User hasn't called POST /api/auth/keys/setup yet.
                // Serve stale cached rows rather than failing outright; if there is
                // nothing in the cache either, re-throw so the controller can return
                // a 409 KEY_PAIR_REQUIRED response.
                logger_1.appLogger.warn('KeyPair not configured — serving stale cache if available', { userId });
                const stale = await this.getEncryptedSnapshotFromCache(userId);
                if (stale.payloadKeys.length > 0) {
                    return stale;
                }
                throw error;
            }
            throw error;
        }
        if (isManualRefresh) {
            try {
                await (0, apiRateLimitUtil_1.recordApiOperation)(userId, 'plaid_refresh');
                (0, logger_1.logDebug)('Recorded manual refresh', { userId });
            }
            catch (error) {
                logger_1.appLogger.warn('Failed to record refresh', { userId, error });
            }
        }
        const apiDuration = Date.now() - cacheStartTime;
        (0, logger_1.logPerformance)('get_finance_snapshot_api', apiDuration, 5000);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched_from_api', userId, {
            source: 'api',
            isManualRefresh,
            accountDelta: fetchResult.snapshot.accounts.length,
            transactionDelta: fetchResult.snapshot.transactions.length,
            investmentAccountDelta: fetchResult.snapshot.investmentAccounts.length,
            investmentDelta: fetchResult.snapshot.investments.length,
            failedItemCount: fetchResult.failedItemIds.length,
        });
        // 加密寫入完成後，從 cache 撈出最新加密 snapshot；附上本輪失敗的 item ids，
        // 讓 controller / 前端可以區分「真的全成功」與「部分 item 失敗、其餘照舊」。
        const encrypted = await this.getEncryptedSnapshotFromCache(userId);
        return {
            ...encrypted,
            partial: fetchResult.failedItemIds.length > 0,
            failedItemIds: fetchResult.failedItemIds,
        };
    }
    /**
     * 從緩存取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
     *
     * 與 `getSnapshotFromCache` 不同：
     *   - 後端不解密任何 payload，只 select metadata + payloadCiphertext + payloadKeyId
     *   - 額外回傳 payloadKeys（去重後的 wrappedSek 清單）
     *
     * 前端流程：
     *   1. 用 privateKey 對每個 payloadKey 做 sealed-box-open → 拿到 SEK
     *   2. 對每個 row 用對應 SEK 解 payloadCiphertext → 拿到 sensitive payload
     *   3. 與 metadata 合併 → 渲染
     *
     * 沒有 payloadCiphertext 的 row（PR 2 之前未 setup keypair 時寫入的）會被跳過。
     */
    static async getEncryptedSnapshotFromCache(userId) {
        const cacheStartTime = Date.now();
        const [accountRows, transactionRows, investmentAccountRows, investmentRows] = await Promise.all([
            prisma_1.prisma.plaidAccountCache.findMany({
                where: {
                    userId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    accountId: true,
                    plaidItemId: true,
                    type: true,
                    bucket: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { cachedAt: 'desc' },
            }),
            prisma_1.prisma.plaidTransactionCache.findMany({
                where: {
                    userId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    transactionId: true,
                    accountId: true,
                    plaidItemId: true,
                    date: true,
                    month: true,
                    isPending: true,
                    isRecurring: true,
                    isSubscription: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { date: 'desc' },
            }),
            prisma_1.prisma.plaidInvestmentAccountCache.findMany({
                where: {
                    userId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    accountId: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { cachedAt: 'desc' },
            }),
            prisma_1.prisma.plaidInvestmentCache.findMany({
                where: {
                    userId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    investmentId: true,
                    accountId: true,
                    type: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { cachedAt: 'desc' },
            }),
        ]);
        const accounts = accountRows.map((r) => ({
            accountId: r.accountId,
            plaidItemId: r.plaidItemId,
            type: r.type,
            bucket: r.bucket,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const transactions = transactionRows.map((r) => ({
            transactionId: r.transactionId,
            accountId: r.accountId,
            plaidItemId: r.plaidItemId ?? null,
            date: r.date,
            month: r.month,
            isPending: r.isPending,
            isRecurring: r.isRecurring,
            isSubscription: r.isSubscription,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const investmentAccounts = investmentAccountRows.map((r) => ({
            accountId: r.accountId,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const investments = investmentRows.map((r) => ({
            investmentId: r.investmentId,
            accountId: r.accountId,
            type: r.type,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const payloadKeyIds = Array.from(new Set([
            ...accounts.map((a) => a.payloadKeyId),
            ...transactions.map((t) => t.payloadKeyId),
            ...investmentAccounts.map((a) => a.payloadKeyId),
            ...investments.map((i) => i.payloadKeyId),
        ]));
        const payloadKeys = await payloadKeyService_1.PayloadKeyService.getForRead(userId, payloadKeyIds);
        const duration = Date.now() - cacheStartTime;
        (0, logger_1.logPerformance)('get_encrypted_finance_snapshot', duration, 200);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched_encrypted', userId, {
            source: 'cache_encrypted',
            accountCount: accounts.length,
            transactionCount: transactions.length,
            investmentAccountCount: investmentAccounts.length,
            investmentCount: investments.length,
            payloadKeyCount: payloadKeys.length,
        });
        return {
            payloadKeys,
            accounts,
            transactions,
            investmentAccounts,
            investments,
            // Cache-only reads have no in-flight fetch failures to report. Callers
            // that want to surface partial-state info must set these explicitly
            // (e.g. `getFinanceSnapshotOptimized` after a refresh attempt).
            partial: false,
            failedItemIds: [],
        };
    }
    /**
     * 從 Plaid API 取得明文增量快照（內部用）。
     *
     * 此回傳值僅在 `saveFinanceSnapshotToCache` 內被加密寫入 DB；caller 不應外洩到 controller。
     * transactionsSync 為增量 API，回傳是「上次 cursor 之後新增/修改的 transactions」。
     * 既有 transactions 保留在 DB 加密表內，**不在此回傳值中**——caller 不需要 merge。
     *
     * `failedItemIds` records `PlaidItem.id` values whose per-item fetch threw.
     * Callers can surface this so the front-end knows the snapshot is partial.
     */
    static async fetchPlaintextFromPlaid(userId) {
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
        if (plaidItems.length === 0) {
            (0, logger_1.logDebug)('No Plaid items found for user', { userId });
            return {
                snapshot: {
                    accounts: [],
                    transactions: [],
                    investmentAccounts: [],
                    investments: [],
                },
                failedItemIds: [],
                pendingCursorUpdates: [],
            };
        }
        const accounts = [];
        const transactions = [];
        const removedTransactionIds = new Set();
        const investmentAccounts = [];
        const investments = [];
        const failedItemIds = [];
        const pendingCursorUpdates = [];
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
                transactions.push(...transactionData.transactions);
                transactionData.removedTransactionIds.forEach((id) => removedTransactionIds.add(id));
                investments.push(...investmentData.investments);
                // Push investmentAccounts: holdings-API entries first, accountsGet entries last.
                // The dedup Map keeps the *last* value for each id, so accountsGet data
                // (which carries the correct institution logo) wins over the entry built
                // inside fetchInvestmentHoldings. This also handles the edge case where
                // an account appears in investmentsHoldingsGet but not in accountsGet —
                // it will still be present from the first push.
                investmentAccounts.push(...investmentData.investmentAccounts);
                investmentAccounts.push(...accountData.investmentAccounts);
                // Buffer the cursor advance instead of writing it now: it is only
                // safe to advance the cursor once the corresponding transaction
                // rows have been persisted, so the actual write happens inside the
                // same `prisma.$transaction` as `saveFinanceSnapshotToCache`.
                if (transactionData.nextCursor) {
                    pendingCursorUpdates.push({
                        plaidItemId: item.id,
                        nextCursor: transactionData.nextCursor,
                    });
                }
            }
            catch (error) {
                // One Plaid Item failing must not silently degrade the snapshot —
                // track the failure so callers can flag the response as partial and
                // the client can decide whether to retry or surface a warning.
                failedItemIds.push(item.id);
                logger_1.appLogger.warn('Failed to fetch data for Plaid item', {
                    error: error.response?.data || error.message || error,
                    plaidItemId: item.id,
                    userId,
                });
            }
        }
        // 處理已刪除的交易 — 直接從加密 cache 移除（不依賴明文欄位）
        if (removedTransactionIds.size > 0) {
            try {
                await prisma_1.prisma.plaidTransactionCache.deleteMany({
                    where: {
                        userId,
                        transactionId: { in: Array.from(removedTransactionIds) },
                    },
                });
            }
            catch (err) {
                logger_1.appLogger.warn('Failed to delete removed transactions', { userId, err });
            }
        }
        // 去重（同一 user 跨 item 不會有同 id，但保險起見）
        const dedupedAccounts = Array.from(new Map(accounts.map((acc) => [acc.id, acc])).values());
        const dedupedInvestmentAccounts = Array.from(new Map(investmentAccounts.map((acc) => [acc.id, acc])).values());
        const dedupedInvestments = Array.from(new Map(investments.map((inv) => [inv.id, inv])).values());
        const dedupedTransactions = Array.from(new Map(transactions.map((tx) => [tx.id, tx])).values());
        const duration = Date.now() - startTime;
        (0, logger_1.logPerformance)('get_finance_snapshot', duration, 5000);
        (0, logger_1.logBusinessEvent)('finance_snapshot_fetched', userId, {
            accountCount: dedupedAccounts.length,
            transactionDeltaCount: dedupedTransactions.length,
            removedTransactionCount: removedTransactionIds.size,
            investmentAccountCount: dedupedInvestmentAccounts.length,
            investmentCount: dedupedInvestments.length,
            failedItemCount: failedItemIds.length,
        });
        auditLog_1.AuditLogger.logPlaidOperation('FETCH_SNAPSHOT', userId, 'SUCCESS', undefined, {
            accountCount: dedupedAccounts.length,
            transactionDeltaCount: dedupedTransactions.length,
            removedTransactionCount: removedTransactionIds.size,
            investmentAccountCount: dedupedInvestmentAccounts.length,
            investmentCount: dedupedInvestments.length,
            // failedItemIds is empty on full success; populated means partial
            // fetch — keep it inside details so the audit-log status stays a
            // simple SUCCESS/FAILURE binary.
            failedItemIds,
            partial: failedItemIds.length > 0,
        }, undefined, duration);
        return {
            snapshot: {
                accounts: dedupedAccounts,
                transactions: dedupedTransactions,
                investmentAccounts: dedupedInvestmentAccounts,
                investments: dedupedInvestments,
            },
            failedItemIds,
            pendingCursorUpdates,
        };
    }
    /**
     * 將明文財務快照加密寫入快取（Phase 3 Zero-Access E2EE only）。
     *
     * 流程：
     *   1. 必須能取得使用者的 publicKey；否則拋 KeyPairNotConfiguredError
     *      （PR 5 已移除 legacy 寫入路徑，使用者必須先 setup keypair）
     *   2. 為這次 sync 建立 4 把 SEK（accounts / transactions / investmentAccounts / investments）
     *   3. 每個 row 把 sensitive 欄位整包 AES-256-GCM 加密成 payloadCiphertext
     *   4. 同步寫 cashFlow + plaidInvestment 加密 AssetSnapshot（趁明文還在記憶體）
     *   5. finally 立即 zeroize 所有 SEK
     */
    static async saveFinanceSnapshotToCache(userId, snapshot, pendingCursorUpdates = []) {
        const sekHandles = [];
        const ts = Date.now();
        try {
            // Atomically: create the four payload-key rows + replace the per-row
            // cache contents + bump sync timestamps + advance Plaid cursors.
            // If any step fails the whole transaction rolls back, so we never
            // leave the DB with half-updated caches pointing at half-deleted
            // payload keys, and Plaid cursors never advance past data we failed
            // to persist (which would otherwise create a permanent gap).
            //
            // `recordSnapshotFromPlaintext` for asset history is intentionally
            // OUTSIDE this transaction — it writes to an independent table and is
            // best-effort; a failure there shouldn't roll back the finance cache.
            //
            // Timeout: the default 5 s is not enough for a first sync that may
            // upsert thousands of transactions sequentially (see
            // `upsertTransactionsCache`). 60 s is comfortably above observed
            // upper bound for ~5 k transactions.
            await prisma_1.prisma.$transaction(async (tx) => {
                await (0, plaidCacheUtil_1.getOrCreateSyncLog)(userId, tx);
                let accountsKey;
                let transactionsKey;
                let investmentAccountsKey;
                let investmentsKey;
                try {
                    const keys = await payloadKeyService_1.PayloadKeyService.createForUserScopes(userId, [
                        `plaid_acct:${userId}:${ts}`,
                        `plaid_tx:${userId}:${ts}`,
                        `plaid_inv_acct:${userId}:${ts}`,
                        `plaid_inv:${userId}:${ts}`,
                    ], tx);
                    accountsKey = keys.get(`plaid_acct:${userId}:${ts}`);
                    transactionsKey = keys.get(`plaid_tx:${userId}:${ts}`);
                    investmentAccountsKey = keys.get(`plaid_inv_acct:${userId}:${ts}`);
                    investmentsKey = keys.get(`plaid_inv:${userId}:${ts}`);
                    sekHandles.push(accountsKey, transactionsKey, investmentAccountsKey, investmentsKey);
                }
                catch (error) {
                    if (error instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
                        logger_1.appLogger.warn('User has no E2EE key pair — Plaid sync skipped. ' +
                            'Client must POST /api/auth/keys/setup before syncing.', { userId });
                    }
                    else {
                        (0, logger_1.logError)('Failed to create E2EE payload keys for Plaid sync', error, { userId });
                    }
                    throw error;
                }
                // ── 1. 帳戶 ──
                if (snapshot.accounts.length > 0) {
                    const accountsToCache = snapshot.accounts.map((acc) => {
                        const split = (0, plaidPayloadBuilder_1.splitAccount)(acc, null /* plaidItemId 暫無法追溯 */, 'banking');
                        return {
                            plaidItemId: split.metadata.plaidItemId ?? '',
                            accountId: split.metadata.accountId,
                            type: split.metadata.type,
                            bucket: split.metadata.bucket,
                            payloadCiphertext: (0, crypto_1.encryptPayload)(accountsKey.sek, split.sensitive),
                            payloadKeyId: accountsKey.payloadKeyId,
                        };
                    });
                    await (0, plaidCacheUtil_1.upsertAccountsCache)(userId, accountsToCache, tx);
                    await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'accounts', { total: accountsToCache.length }, tx);
                }
                // ── 2. 交易 ──
                if (snapshot.transactions.length > 0) {
                    const transactionsToCache = snapshot.transactions.map((tx2) => {
                        const split = (0, plaidPayloadBuilder_1.splitTransaction)(tx2, null);
                        return {
                            accountId: split.metadata.accountId,
                            transactionId: split.metadata.transactionId,
                            plaidItemId: split.metadata.plaidItemId ?? null,
                            date: split.metadata.date,
                            month: split.metadata.month,
                            isPending: split.metadata.isPending,
                            isRecurring: split.metadata.isRecurring,
                            isSubscription: split.metadata.isSubscription,
                            payloadCiphertext: (0, crypto_1.encryptPayload)(transactionsKey.sek, split.sensitive),
                            payloadKeyId: transactionsKey.payloadKeyId,
                        };
                    });
                    await (0, plaidCacheUtil_1.upsertTransactionsCache)(userId, transactionsToCache, tx);
                    await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'transactions', { total: transactionsToCache.length }, tx);
                }
                // ── 3. 投資帳戶 ──
                if (snapshot.investmentAccounts.length > 0) {
                    const investmentAccountsToCache = snapshot.investmentAccounts.map((acc) => {
                        const split = (0, plaidPayloadBuilder_1.splitInvestmentAccount)(acc);
                        return {
                            accountId: split.metadata.accountId,
                            payloadCiphertext: (0, crypto_1.encryptPayload)(investmentAccountsKey.sek, split.sensitive),
                            payloadKeyId: investmentAccountsKey.payloadKeyId,
                        };
                    });
                    await (0, plaidCacheUtil_1.upsertInvestmentAccountsCache)(userId, investmentAccountsToCache, tx);
                }
                // ── 4. 投資持倉 ──
                if (snapshot.investments.length > 0) {
                    const investmentsToCache = snapshot.investments.map((inv) => {
                        const split = (0, plaidPayloadBuilder_1.splitInvestment)(inv);
                        return {
                            accountId: split.metadata.accountId,
                            investmentId: split.metadata.investmentId,
                            type: split.metadata.type,
                            payloadCiphertext: (0, crypto_1.encryptPayload)(investmentsKey.sek, split.sensitive),
                            payloadKeyId: investmentsKey.payloadKeyId,
                        };
                    });
                    await (0, plaidCacheUtil_1.upsertInvestmentsCache)(userId, investmentsToCache, tx);
                    await (0, plaidCacheUtil_1.updateSyncTimestamp)(userId, 'investments', { total: investmentsToCache.length }, tx);
                }
                // ── 5. Advance Plaid transaction cursors (only after writes succeed) ──
                // Done last so a failure in any of the cache writes above rolls back
                // the cursor advance too, avoiding permanent gaps in transactionsSync.
                const txAny = tx;
                for (const { plaidItemId, nextCursor } of pendingCursorUpdates) {
                    await txAny.plaidItem.update({
                        where: { id: plaidItemId },
                        data: { transactionsCursor: nextCursor },
                    });
                }
            }, {
                timeout: 60_000,
                maxWait: 10_000,
            });
            (0, logger_1.logDebug)('Saved encrypted finance snapshot to cache', {
                userId,
                accounts: snapshot.accounts.length,
                transactions: snapshot.transactions.length,
                investmentAccounts: snapshot.investmentAccounts.length,
                investments: snapshot.investments.length,
            });
            // ── Phase 3: 在還持有明文時直接算 cashFlow + plaidInvestment 並加密寫入 ──
            // exchange / debank 的 cryptoSpot / defiProtocol 由各自的 sync 自己更新。
            // Best-effort: failures here are logged in recordSnapshotFromPlaintext;
            // a missing snapshot just means the asset-history chart misses a point
            // for this metric, not that the Plaid cache is invalid.
            try {
                const plaidMetrics = assetService_1.AssetService.computePlaidMetricsFromSnapshot({
                    accounts: snapshot.accounts,
                    investments: snapshot.investments,
                });
                await assetService_1.AssetService.recordSnapshotFromPlaintext(userId, plaidMetrics);
            }
            catch (assetError) {
                logger_1.appLogger.warn('Failed to record Plaid asset snapshot (cache already saved)', {
                    userId,
                    error: assetError instanceof Error ? assetError.message : assetError,
                });
            }
        }
        catch (error) {
            logger_1.appLogger.warn('Error saving encrypted snapshot to cache', { userId, error });
            throw error;
        }
        finally {
            sekHandles.forEach((handle) => (0, crypto_1.zeroize)(handle.sek));
        }
    }
}
exports.PlaidCacheService = PlaidCacheService;
//# sourceMappingURL=plaidCacheService.js.map