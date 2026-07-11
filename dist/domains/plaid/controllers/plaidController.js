"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePlaidWebhook = exports.getCacheInfo = exports.clearPlaidCache = exports.refreshPlaidCache = exports.getFinanceSnapshotOptimized = exports.getFinanceSnapshot = exports.disconnectPlaidAccount = exports.exchangePublicToken = exports.createLinkToken = exports.updatePlaidAccountOrder = void 0;
const plaidService_1 = require("../services/plaidService");
const logger_1 = require("../../logger");
const plaidCacheUtil_1 = require("../lib/plaidCacheUtil");
const prisma_1 = require("../../shared/lib/prisma");
const updatePlaidAccountOrder = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { accountIds, investmentAccountIds } = req.body;
        if (accountIds === undefined && investmentAccountIds === undefined) {
            res.status(400).json({ error: 'accountIds or investmentAccountIds is required' });
            return;
        }
        const payload = {};
        if (accountIds !== undefined) {
            payload.accountIds = accountIds;
        }
        if (investmentAccountIds !== undefined) {
            payload.investmentAccountIds = investmentAccountIds;
        }
        await plaidService_1.PlaidService.updateAccountOrder(req.userId, payload);
        res.json({ status: 'success', message: 'Account order updated successfully.' });
    }
    catch (error) {
        (0, logger_1.logError)('Update account order failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: '無法更新卡片排序' });
    }
};
exports.updatePlaidAccountOrder = updatePlaidAccountOrder;
const createLinkToken = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const linkToken = await plaidService_1.PlaidService.createLinkToken(req.userId);
        res.json({ link_token: linkToken });
    }
    catch (error) {
        const errorCode = error.response?.data?.error_code;
        const isCountryCodeError = errorCode === 'INVALID_FIELD' && error.message?.includes('country');
        const isFieldError = errorCode === 'INVALID_FIELD';
        const statusCode = isCountryCodeError || isFieldError ? 400 : 500;
        // 如果是配置錯誤，傳遞詳細的錯誤訊息供調試
        const message = error.message?.includes('Plaid ')
            ? error.message
            : '無法產生 Plaid Link Token';
        (0, logger_1.logError)('Create Plaid link token failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
            errorCode,
            statusCode,
        });
        res.status(statusCode).json({
            error: message,
            errorCode: errorCode || 'UNKNOWN_ERROR',
            requestId: error.response?.data?.request_id,
        });
    }
};
exports.createLinkToken = createLinkToken;
const exchangePublicToken = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { public_token, institution_name } = req.body;
        await plaidService_1.PlaidService.exchangePublicToken(req.userId, public_token, institution_name);
        res.json({ status: 'success', message: '銀行帳戶已成功連結' });
    }
    catch (error) {
        (0, logger_1.logError)('Exchange Plaid public token failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: 'Token 交換失敗' });
    }
};
exports.exchangePublicToken = exchangePublicToken;
const disconnectPlaidAccount = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { accountId } = req.body;
        if (!accountId) {
            res.status(400).json({ error: 'accountId is required' });
            return;
        }
        await plaidService_1.PlaidService.disconnectAccount(req.userId, accountId);
        res.json({ status: 'success', message: 'Account disconnected successfully.' });
    }
    catch (error) {
        (0, logger_1.logError)('Disconnect Plaid account failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: '無法解除連結銀行帳戶' });
    }
};
exports.disconnectPlaidAccount = disconnectPlaidAccount;
const getFinanceSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const snapshot = await plaidService_1.PlaidService.getFinanceSnapshot(req.userId);
        res.json(snapshot);
    }
    catch (error) {
        (0, logger_1.logError)('Get finance snapshot failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: '無法取得 Plaid 金融資料' });
    }
};
exports.getFinanceSnapshot = getFinanceSnapshot;
/**
 * 獲取財務快照（使用緩存，避免過度 API 調用）
 */
const getFinanceSnapshotOptimized = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const forceRefresh = req.query.refresh === 'true' || req.body?.forceRefresh === true;
        const snapshot = await plaidService_1.PlaidService.getFinanceSnapshotOptimized(req.userId, forceRefresh);
        res.json({
            ...snapshot,
            _cacheHint: forceRefresh ? '強制刷新，來自 Plaid API' : '可能來自緩存',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get finance snapshot optimized failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: '無法取得金融資料' });
    }
};
exports.getFinanceSnapshotOptimized = getFinanceSnapshotOptimized;
/**
 * 手動刷新 Plaid 緩存
 */
const refreshPlaidCache = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        // 手動刷新，強制從 API 獲取數據
        const snapshot = await plaidService_1.PlaidService.getFinanceSnapshotOptimized(req.userId, true);
        res.json({
            status: 'success',
            message: '緩存已刷新',
            dataRefreshed: {
                accounts: snapshot.accounts.length,
                transactions: snapshot.transactions.length,
                investmentAccounts: snapshot.investmentAccounts.length,
                investments: snapshot.investments.length,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Refresh Plaid cache failed', error, {
            userId: req.userId,
            errorData: error.response?.data,
        });
        res.status(500).json({ error: '無法刷新緩存' });
    }
};
exports.refreshPlaidCache = refreshPlaidCache;
/**
 * 清空 Plaid 緩存（完整清除）
 */
const clearPlaidCache = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        await (0, plaidCacheUtil_1.clearAllPlaidCache)(req.userId);
        res.json({
            status: 'success',
            message: '所有 Plaid 緩存已清除',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Clear Plaid cache failed', error, {
            userId: req.userId,
        });
        res.status(500).json({ error: '無法清除緩存' });
    }
};
exports.clearPlaidCache = clearPlaidCache;
/**
 * 獲取 Plaid 緩存統計信息
 */
const getCacheInfo = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const stats = await (0, plaidCacheUtil_1.getCacheStats)(req.userId);
        res.json({
            status: 'success',
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
        res.status(500).json({ error: '無法獲取緩存信息' });
    }
};
exports.getCacheInfo = getCacheInfo;
/**
 * 處理 Plaid Webhook
 * 無需認證 - Plaid 服務直接調用
 */
const handlePlaidWebhook = async (req, res) => {
    try {
        const { webhook_type, webhook_code, item_id, error } = req.body;
        (0, logger_1.logDebug)('Plaid webhook received', {
            webhook_type,
            webhook_code,
            item_id,
        });
        // 驗證 webhook（可選但推薦）
        // const isValid = verifyPlaidWebhook(req);
        // if (!isValid) {
        //   logWarn('Invalid Plaid webhook signature', { webhook_type });
        //   return res.status(401).json({ error: 'Invalid webhook' });
        // }
        // 立即返回 200，確認已收到（非回應式處理）
        res.status(200).json({ webhook_received: true });
        // 異步處理 webhook
        processPlaidWebhook(webhook_type, webhook_code, item_id, error).catch((err) => {
            (0, logger_1.logError)('Error processing Plaid webhook', err, {
                webhook_type,
                webhook_code,
            });
        });
    }
    catch (error) {
        (0, logger_1.logError)('Webhook receiver error', error);
        res.status(500).json({ error: 'Webhook processing failed' });
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
                // Item 發生錯誤
                (0, logger_1.logError)('Plaid item error', new Error(error?.error_message || 'Unknown item error'), {
                    item_id,
                    error: error?.error_message,
                });
                // TODO: 將錯誤狀態保存到數據庫或通知用戶
                break;
            case 'PENDING_EXPIRATION':
                // Item 的授權即將過期
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