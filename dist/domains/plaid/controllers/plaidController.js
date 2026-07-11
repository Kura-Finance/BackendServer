"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePlaidWebhook = exports.getCacheInfo = exports.getEncryptedFinanceSnapshot = exports.clearPlaidCache = exports.getFinanceSnapshotOptimized = exports.disconnectPlaidItem = exports.exchangePublicToken = exports.createLinkToken = void 0;
const plaidService_1 = require("../services/plaidService");
const logger_1 = require("../../logger");
const plaidCacheUtil_1 = require("../lib/plaidCacheUtil");
const webhookVerification_1 = require("../lib/webhookVerification");
const prisma_1 = require("../../shared/lib/prisma");
const apiResponse_1 = require("../../shared/lib/apiResponse");
const payloadKeyService_1 = require("../../shared/services/payloadKeyService");
function resolvePlaidLastSyncedAt(cacheStats) {
    const timestamps = [
        cacheStats.lastSynced,
        cacheStats.accountsSynced,
        cacheStats.transactionsSynced,
        cacheStats.investmentsSynced,
    ]
        .filter((value) => Boolean(value))
        .map((value) => value.getTime());
    if (timestamps.length === 0) {
        return null;
    }
    return new Date(Math.max(...timestamps)).toISOString();
}
const createLinkToken = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const linkToken = await plaidService_1.PlaidService.createLinkToken(req.userId);
        (0, apiResponse_1.sendSuccess)(res, { link_token: linkToken });
    }
    catch (error) {
        const errorCode = error.response?.data?.error_code;
        const isCountryCodeError = errorCode === 'INVALID_FIELD' && error.message?.includes('country');
        const isFieldError = errorCode === 'INVALID_FIELD';
        const statusCode = isCountryCodeError || isFieldError ? 400 : 500;
        // 如果是配置錯誤，傳遞詳細的錯誤訊息供調試
        const message = error.message?.includes('Plaid ')
            ? error.message
            : 'Unable to create Plaid Link Token';
        (0, logger_1.logError)('Create Plaid link token failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
            errorCode,
            statusCode,
        });
        (0, apiResponse_1.sendError)(res, statusCode, {
            code: errorCode || 'UNKNOWN_ERROR',
            message,
            details: {
                requestId: error.response?.data?.request_id,
            },
        });
    }
};
exports.createLinkToken = createLinkToken;
const exchangePublicToken = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { public_token, institution_name } = req.body;
        await plaidService_1.PlaidService.exchangePublicToken(req.userId, public_token, institution_name);
        // Phase 3：第一次連接時觸發加密快照同步（前端會用 /encrypted endpoint 取資料）
        try {
            const snapshot = await plaidService_1.PlaidService.getFinanceSnapshotOptimized(req.userId, false);
            (0, apiResponse_1.sendSuccess)(res, {
                message: 'Bank account linked successfully',
                snapshot,
            });
        }
        catch (snapshotError) {
            // 即使快照失敗，也不影響連結成功狀態
            (0, logger_1.logDebug)('Failed to fetch initial snapshot after successful connection', snapshotError?.message || snapshotError);
            (0, apiResponse_1.sendSuccess)(res, {
                message: 'Bank account linked successfully',
            });
        }
    }
    catch (error) {
        (0, logger_1.logError)('Exchange Plaid public token failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Public token exchange failed' });
    }
};
exports.exchangePublicToken = exchangePublicToken;
const disconnectPlaidItem = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { accountId } = req.body;
        const disconnectResult = await plaidService_1.PlaidService.disconnectItemByAccountId(req.userId, accountId);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Plaid item disconnected successfully.',
            data: {
                matchedAccountId: disconnectResult.accountId,
                disconnectedItemId: disconnectResult.disconnectedItemId,
                institution: disconnectResult.institution,
                plaidRequestId: disconnectResult.plaidRequestId,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Disconnect Plaid item failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to disconnect Plaid item' });
    }
};
exports.disconnectPlaidItem = disconnectPlaidItem;
/**
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - 達到限制時返回緩存數據
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天, VIP: 無限
 */
const getFinanceSnapshotOptimized = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        // 只有當用戶明確請求 refresh=true 時才是手動刷新，受每日限制
        const { refresh } = req.query;
        const isManualRefresh = refresh === true || req.body?.isManualRefresh === true;
        try {
            const snapshot = await plaidService_1.PlaidService.getFinanceSnapshotOptimized(req.userId, isManualRefresh);
            const cacheStats = await (0, plaidCacheUtil_1.getCacheStats)(req.userId);
            const lastSyncedAt = isManualRefresh
                ? new Date().toISOString()
                : resolvePlaidLastSyncedAt(cacheStats);
            const status = snapshot.partial ? 207 : 200;
            (0, apiResponse_1.sendSuccess)(res, {
                ...snapshot,
                _cacheSource: isManualRefresh ? 'Forced refresh from Plaid API' : 'From cache',
                lastSyncedAt,
            }, status);
        }
        catch (error) {
            // 處理刷新限制錯誤 - 達到限制時返回緩存數據
            if (error.statusCode === 429 && isManualRefresh) {
                try {
                    (0, logger_1.logDebug)('Refresh limit reached, returning cached data', { userId: req.userId });
                    const cachedSnapshot = await plaidService_1.PlaidService.getFinanceSnapshotOptimized(req.userId, false); // 獲取緩存不受限制
                    const cacheStats = await (0, plaidCacheUtil_1.getCacheStats)(req.userId);
                    (0, apiResponse_1.sendSuccess)(res, {
                        ...cachedSnapshot,
                        _cacheSource: 'Daily refresh limit reached, showing last synced data',
                        lastSyncedAt: resolvePlaidLastSyncedAt(cacheStats),
                        _limitReached: true,
                        _message: error.message,
                    });
                    return;
                }
                catch (cacheError) {
                    // 如果無法獲取緩存數據，返回錯誤
                    (0, apiResponse_1.sendError)(res, 429, {
                        code: 'RATE_LIMITED',
                        message: error.message,
                        details: {
                            refreshLimit: error.refreshLimit,
                            refreshCountRemaining: error.refreshCountRemaining,
                            upgrade: process.env.APP_UPGRADE_URL || 'https://kura-finance.com/pricing',
                            retryAfter: 86400,
                        },
                    });
                    return;
                }
            }
            throw error;
        }
    }
    catch (error) {
        if (error instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
            (0, apiResponse_1.sendError)(res, 409, {
                code: 'KEY_PAIR_REQUIRED',
                message: 'E2EE key pair not configured. Call POST /api/auth/keys/setup to enable encrypted sync.',
            });
            return;
        }
        (0, logger_1.logError)('Get finance snapshot failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch financial snapshot' });
    }
};
exports.getFinanceSnapshotOptimized = getFinanceSnapshotOptimized;
/**
 * 清空 Plaid 緩存（完整清除）
 */
const clearPlaidCache = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        await (0, plaidCacheUtil_1.clearAllPlaidCache)(req.userId);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'All Plaid cache cleared',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Clear Plaid cache failed', error, {
            userId: req.userId,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to clear cache' });
    }
};
exports.clearPlaidCache = clearPlaidCache;
/**
 * 取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
 *
 * 回傳：
 *   {
 *     payloadKeys: [{ id, scope, wrappedSek, algorithm }, ...],
 *     accounts:    [{ accountId, plaidItemId, type, bucket, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     transactions:[{ transactionId, accountId, date, month, isPending, ..., payloadCiphertext, payloadKeyId }, ...],
 *     investmentAccounts: [{ accountId, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     investments: [{ investmentId, accountId, type, ..., payloadCiphertext, payloadKeyId }, ...],
 *     lastSyncedAt
 *   }
 *
 * 前端流程：
 *   1. 用 KEK 解 encryptedPrivateKey → privateKey
 *   2. for each payloadKey: SEK = sealed_box_open(wrappedSek, privateKey, publicKey)
 *   3. for each row: plain = AES-GCM_decrypt(SEK, payloadCiphertext)
 *   4. 合併 metadata + plain → 渲染
 */
const getEncryptedFinanceSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const snapshot = await plaidService_1.PlaidService.getEncryptedFinanceSnapshot(req.userId);
        const cacheStats = await (0, plaidCacheUtil_1.getCacheStats)(req.userId);
        const lastSyncedAt = resolvePlaidLastSyncedAt(cacheStats);
        (0, apiResponse_1.sendSuccess)(res, {
            ...snapshot,
            lastSyncedAt,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get encrypted finance snapshot failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch encrypted financial snapshot' });
    }
};
exports.getEncryptedFinanceSnapshot = getEncryptedFinanceSnapshot;
/**
 * 獲取 Plaid 緩存統計信息
 */
const getCacheInfo = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const stats = await (0, plaidCacheUtil_1.getCacheStats)(req.userId);
        (0, apiResponse_1.sendSuccess)(res, {
            cacheStats: {
                cachedAccounts: stats.accounts,
                cachedTransactions: stats.transactions,
                cachedInvestmentAccounts: stats.investmentAccounts,
                cachedInvestments: stats.investments,
                lastFullSync: stats.lastSynced,
                accountsLastSync: stats.accountsSynced,
                transactionsLastSync: stats.transactionsSynced,
                investmentsLastSync: stats.investmentsSynced,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get cache info failed', error, {
            userId: req.userId,
        });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch cache info' });
    }
};
exports.getCacheInfo = getCacheInfo;
/**
 * 處理 Plaid Webhook
 * 無需認證 - Plaid 服務直接調用
 */
const handlePlaidWebhook = async (req, res) => {
    try {
        const verification = await (0, webhookVerification_1.verifyPlaidWebhook)(req);
        if (!verification.isValid) {
            (0, logger_1.logDebug)('Rejected Plaid webhook: signature validation failed', {
                reason: verification.reason,
            });
            (0, apiResponse_1.sendError)(res, 401, { code: 'INVALID_SIGNATURE', message: 'Invalid Plaid webhook signature' });
            return;
        }
        const { webhook_type, webhook_code, item_id, error } = req.body;
        (0, logger_1.logDebug)('Plaid webhook received', {
            webhook_type,
            webhook_code,
            item_id,
        });
        // 立即返回 200，確認已收到（非回應式處理）
        (0, apiResponse_1.sendSuccess)(res, { webhook_received: true }, 200);
        // 非同步處理 Webhook
        processPlaidWebhook(webhook_type, webhook_code, item_id, error).catch((err) => {
            (0, logger_1.logError)('Error processing Plaid webhook', err, {
                webhook_type,
                webhook_code,
            });
        });
    }
    catch (error) {
        (0, logger_1.logError)('Webhook receiver error', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Webhook processing failed' });
    }
};
exports.handlePlaidWebhook = handlePlaidWebhook;
/**
 * 異步處理 Plaid Webhook
 */
async function processPlaidWebhook(webhook_type, webhook_code, item_id, error) {
    try {
        switch (webhook_type) {
            case 'ITEM':
                await handleItemWebhook(webhook_code, item_id, error);
                break;
            case 'TRANSACTIONS':
                await handleTransactionsWebhook(webhook_code, item_id);
                break;
            case 'INVESTMENTS_TRANSACTIONS':
                await handleInvestmentTransactionsWebhook(webhook_code, item_id);
                break;
            case 'AUTH':
                await handleAuthWebhook(webhook_code, item_id);
                break;
            default:
                (0, logger_1.logDebug)('Unknown webhook type', { webhook_type });
        }
    }
    catch (error) {
        (0, logger_1.logError)('Webhook processing error', error, {
            webhook_type,
            webhook_code,
        });
    }
}
/**
 * 處理 ITEM 相關事件
 */
async function handleItemWebhook(webhook_code, item_id, error) {
    try {
        switch (webhook_code) {
            case 'ERROR':
                // Plaid Item 發生錯誤
                (0, logger_1.logError)('Plaid item error', new Error(error?.error_message || 'Unknown item error'), {
                    item_id,
                    error: error?.error_message,
                });
                // TODO: 將錯誤狀態保存到數據庫或通知用戶
                break;
            case 'PENDING_EXPIRATION':
                // Plaid Item 的授權即將過期
                (0, logger_1.logDebug)('Plaid item pending expiration', { item_id });
                // TODO: 提醒用戶重新驗證
                break;
            case 'LOGIN_REPAIRED':
                // LOGIN_REPAIRED 表示用戶已重新授權
                (0, logger_1.logBusinessEvent)('plaid_item_repaired', 'system', {
                    item_id,
                });
                // TODO: 清除錯誤狀態，恢復同步
                break;
            case 'USER_PERMISSION_REVOKED':
                // 用戶撤銷了權限
                await handleUserPermissionRevoked(item_id);
                break;
            default:
                (0, logger_1.logDebug)('Item webhook code', { webhook_code });
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error handling item webhook', err, { item_id });
    }
}
/**
 * 處理交易同步完成
 */
async function handleTransactionsWebhook(webhook_code, item_id) {
    try {
        if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
            (0, logger_1.logBusinessEvent)('plaid_transactions_sync_available', 'system', {
                item_id,
            });
            // 🔑 主動同步：後端立即從 Plaid 拉取最新數據
            await triggerPlaidDataSync(item_id, 'TRANSACTIONS');
        }
        else if (webhook_code === 'INITIAL_UPDATE_COMPLETE') {
            (0, logger_1.logBusinessEvent)('plaid_initial_transactions_complete', 'system', {
                item_id,
            });
            // 初始交易同步完成
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error handling transactions webhook', err, { item_id });
    }
}
/**
 * 處理投資交易同步完成
 */
async function handleInvestmentTransactionsWebhook(webhook_code, item_id) {
    try {
        if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
            (0, logger_1.logBusinessEvent)('plaid_investment_transactions_sync_available', 'system', {
                item_id,
            });
            // 🔑 主動同步：後端立即從 Plaid 拉取最新投資數據
            await triggerPlaidDataSync(item_id, 'INVESTMENTS');
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error handling investment transactions webhook', err, { item_id });
    }
}
/**
 * 處理 AUTH 相關事件
 */
async function handleAuthWebhook(webhook_code, item_id) {
    try {
        switch (webhook_code) {
            case 'VERIFIED_MICRODEPOSITS_AVAILABLE':
                (0, logger_1.logBusinessEvent)('plaid_microdeposits_available', 'system', { item_id });
                break;
            case 'VERIFIED_MICRODEPOSITS_PENDING_EXPIRATION':
                (0, logger_1.logDebug)('Plaid microdeposits pending expiration', { item_id });
                break;
            default:
                (0, logger_1.logDebug)('Auth webhook code', { webhook_code });
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error handling auth webhook', err, { item_id });
    }
}
/**
 * 觸發 Plaid 數據同步（後端主動拉取）
 * 在 Webhook 中調用，確保即使 App 未打開也能更新數據
 */
async function triggerPlaidDataSync(item_id, dataType) {
    try {
        const plaidItem = await prisma_1.prisma.plaidItem.findUnique({
            where: { itemId: item_id },
            include: { user: true },
        });
        if (!plaidItem) {
            (0, logger_1.logDebug)('Plaid item not found', { item_id });
            return;
        }
        (0, logger_1.logDebug)('Triggering Plaid data sync', {
            userId: plaidItem.userId,
            item_id,
            dataType,
        });
        // 🔑 調用 PlaidService 的同步方法
        // 這些方法會後端主動拉取最新數據並保存到緩存
        switch (dataType) {
            case 'TRANSACTIONS':
                await plaidService_1.PlaidService.syncTransactionsFromWebhook(plaidItem.userId, item_id);
                break;
            case 'INVESTMENTS':
                await plaidService_1.PlaidService.syncInvestmentsFromWebhook(plaidItem.userId, item_id);
                break;
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error triggering Plaid data sync', err, { item_id });
    }
}
/**
 * 處理用戶權限撤銷
 */
async function handleUserPermissionRevoked(item_id) {
    try {
        const plaidItem = await prisma_1.prisma.plaidItem.findUnique({
            where: { itemId: item_id },
        });
        if (plaidItem) {
            (0, logger_1.logDebug)('User revoked Plaid permissions', {
                item_id,
                userId: plaidItem.userId,
            });
            // 標記 item 為需要重新授權
            (0, logger_1.logBusinessEvent)('plaid_permissions_revoked', plaidItem.userId, {
                item_id,
            });
            // TODO: 可在數據庫中添加字段如：needsReauth = true
        }
    }
    catch (err) {
        (0, logger_1.logError)('Error handling user permission revoked', err, { item_id });
    }
}
//# sourceMappingURL=plaidController.js.map