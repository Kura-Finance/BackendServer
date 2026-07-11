"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserTier = getUserTier;
exports.getApiLimitForTier = getApiLimitForTier;
exports.getAssetHistoryDaysLimitForTier = getAssetHistoryDaysLimitForTier;
exports.clampAssetHistoryDays = clampAssetHistoryDays;
exports.getTodayDateString = getTodayDateString;
exports.getTodayOperationCount = getTodayOperationCount;
exports.checkApiLimit = checkApiLimit;
exports.recordApiOperation = recordApiOperation;
exports.getRefreshLimitForTier = getRefreshLimitForTier;
exports.getTodayRefreshCount = getTodayRefreshCount;
exports.checkRefreshLimit = checkRefreshLimit;
exports.recordRefresh = recordRefresh;
exports.updateUserTier = updateUserTier;
const prisma_1 = require("./prisma");
const logger_1 = require("../../logger");
/**
 * 每個等級允許的每日 API 操作限制
 *
 * 根據 2026 年商業規劃：
 * - Kura Basic (免費版): 無限帳戶綁定，1手動同步額度
 * - Kura Pro (進階版): 無限帳戶綁定，5 次/日手動同步
 * - Kura Ultimate (旗艦版): 無限帳戶綁定，20 次/日高頻同步
 * - Kura VIP (專屬版): 無限所有操作，可綁定專屬節點
 */
const API_LIMITS_BY_TIER = {
    // 帳戶綁定限制 (無上限綁定傳統銀行、信用卡、Web3 錢包地址)
    'exchange_connect': {
        'Basic': -1, // 基礎用戶: 無限制
        'Pro': -1, // Pro 用戶: 無限制
        'Ultimate': -1, // Ultimate 用戶: 無限制
        'VIP': -1, // VIP 用戶: 無限制
    },
    // 手動同步/查詢餘額限制 (API 調用計數)
    'exchange_balance': {
        'Basic': 1, // 基礎用戶: 每日 1 次手動強制同步
        'Pro': 5, // Pro 用戶: 每日 5 次手動強制同步
        'Ultimate': 20, // Ultimate 用戶: 每日 20 次高頻手動同步
        'VIP': -1, // VIP 用戶: 無限制
    },
    // Plaid 手動刷新限制 (銀行帳戶同步)
    'plaid_refresh': {
        'Basic': 1, // 基礎用戶: 每日 1 次手動刷新
        'Pro': 5, // Pro 用戶: 每日 5 次手動刷新
        'Ultimate': 20, // Ultimate 用戶: 每日 20 次手動刷新
        'VIP': -1, // VIP 用戶: 無限制
    },
    // DeBank 手動刷新限制（協議資料同步）
    'debank_refresh': {
        'Basic': 1, // 基礎用戶: 每日 1 次手動刷新
        'Pro': 5, // Pro 用戶: 每日 5 次手動刷新
        'Ultimate': 20, // Ultimate 用戶: 每日 20 次手動刷新
        'VIP': -1, // VIP 用戶: 無限制
    },
};
/**
 * Plaid 刷新限制（向後相容）
 * @deprecated 使用 checkApiLimit('plaid_refresh', userId) 替代
 */
const REFRESH_LIMITS_BY_TIER = {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
    'VIP': -1,
};
/** TrackFi 加密資產歷史（GET /api/assets/history/encrypted）可查詢的最大天數 */
const ASSET_HISTORY_DAYS_BY_TIER = {
    Basic: 30,
    Pro: 365,
    Ultimate: 365,
    VIP: 365,
};
/**
 * 獲取用戶的訂閱等級
 */
async function getUserTier(userId) {
    const dbStartTime = Date.now();
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { tier: true },
        });
        (0, logger_1.logDatabaseOperation)('SELECT', 'users', Date.now() - dbStartTime, true);
        return user?.tier || 'Basic';
    }
    catch (error) {
        (0, logger_1.logDatabaseOperation)('SELECT', 'users', Date.now() - dbStartTime, false);
        (0, logger_1.logDebug)(`Failed to fetch user tier, defaulting to Basic`, { userId, error });
        return 'Basic';
    }
}
/**
 * 獲取特定操作的每日限制
 */
function getApiLimitForTier(operationType, tier) {
    const limits = API_LIMITS_BY_TIER[operationType];
    return limits[tier] ?? limits['Basic'] ?? 1;
}
/** TrackFi 歷史查詢天數上限（依訂閱等級；未知 tier 視同 Basic） */
function getAssetHistoryDaysLimitForTier(tier) {
    return ASSET_HISTORY_DAYS_BY_TIER[tier] ?? 30;
}
/** 將請求的 days 限制在 tier 上限與全域 365 天內 */
function clampAssetHistoryDays(requestedDays, tier) {
    const tierLimit = getAssetHistoryDaysLimitForTier(tier);
    return Math.min(requestedDays, tierLimit, 365);
}
/**
 * 取得今天的日期字串（YYYY-MM-DD）
 */
function getTodayDateString() {
    const today = new Date();
    return today.toISOString().slice(0, 10);
}
/**
 * 獲取用戶今天特定操作的次數
 */
async function getTodayOperationCount(userId, operationType) {
    const dbStartTime = Date.now();
    const today = getTodayDateString();
    try {
        const log = await prisma_1.prisma.apiOperationLog.findUnique({
            where: {
                userId_operationType_date: {
                    userId,
                    operationType,
                    date: today,
                },
            },
            select: { count: true },
        });
        (0, logger_1.logDatabaseOperation)('SELECT', 'api_operation_logs', Date.now() - dbStartTime, true);
        return log?.count || 0;
    }
    catch (error) {
        (0, logger_1.logDatabaseOperation)('SELECT', 'api_operation_logs', Date.now() - dbStartTime, false);
        (0, logger_1.logDebug)(`Failed to fetch operation count`, { userId, operationType, error });
        return 0;
    }
}
/**
 * 檢查用戶是否可以執行特定操作
 * @returns { canOperate: boolean, operationCountRemaining: number, operationLimit: number, message?: string }
 */
async function checkApiLimit(userId, operationType) {
    const tier = await getUserTier(userId);
    const operationLimit = getApiLimitForTier(operationType, tier);
    // VIP 用戶不受限制
    if (operationLimit === -1) {
        return {
            canOperate: true,
            operationCountRemaining: 999,
            operationLimit: -1,
        };
    }
    const todayOperationCount = await getTodayOperationCount(userId, operationType);
    const operationCountRemaining = Math.max(0, operationLimit - todayOperationCount);
    const operationNames = {
        'exchange_connect': 'exchange account connections',
        'exchange_balance': 'exchange balance queries',
        'plaid_refresh': 'Plaid refreshes',
        'debank_refresh': 'DeBank refreshes',
    };
    const operationName = operationNames[operationType] || operationType;
    return {
        canOperate: operationCountRemaining > 0,
        operationCountRemaining,
        operationLimit,
        message: operationCountRemaining > 0
            ? `You have ${operationCountRemaining} ${operationName} remaining today.`
            : `Daily ${operationName} limit reached. ${tier} users can perform ${operationLimit} per day.`,
    };
}
/**
 * 記錄一次 API 操作
 */
async function recordApiOperation(userId, operationType) {
    const dbStartTime = Date.now();
    const today = getTodayDateString();
    try {
        await prisma_1.prisma.apiOperationLog.upsert({
            where: {
                userId_operationType_date: {
                    userId,
                    operationType,
                    date: today,
                },
            },
            update: {
                count: {
                    increment: 1,
                },
            },
            create: {
                userId,
                operationType,
                date: today,
                count: 1,
            },
        });
        (0, logger_1.logDatabaseOperation)('UPSERT', 'api_operation_logs', Date.now() - dbStartTime, true);
        (0, logger_1.logDebug)(`Recorded API operation for user`, { userId, operationType, today });
    }
    catch (error) {
        (0, logger_1.logDatabaseOperation)('UPSERT', 'api_operation_logs', Date.now() - dbStartTime, false);
        throw error;
    }
}
/**
 * ============================================
 * Plaid 特定函數（向後相容）
 * ============================================
 * 這些函數為了相容舊代碼而保留
 * @deprecated 使用通用 API 操作函數代替
 */
/**
 * 獲取用戶的每日 Plaid 刷新限制
 * @deprecated 使用 getApiLimitForTier('plaid_refresh', tier) 替代
 */
function getRefreshLimitForTier(tier) {
    return REFRESH_LIMITS_BY_TIER[tier] ?? 1;
}
/**
 * 獲取用戶今天的 Plaid 刷新次數
 * @deprecated 使用 getTodayOperationCount(userId, 'plaid_refresh') 替代
 */
async function getTodayRefreshCount(userId) {
    return getTodayOperationCount(userId, 'plaid_refresh');
}
/**
 * 檢查用戶是否可以執行 Plaid 刷新
 * @deprecated 使用 checkApiLimit(userId, 'plaid_refresh') 替代
 */
async function checkRefreshLimit(userId) {
    const result = await checkApiLimit(userId, 'plaid_refresh');
    return {
        canRefresh: result.canOperate,
        refreshCountRemaining: result.operationCountRemaining,
        refreshLimit: result.operationLimit,
        ...(result.message && { message: result.message }),
    };
}
/**
 * 記錄一次 Plaid 刷新操作
 * @deprecated 使用 recordApiOperation(userId, 'plaid_refresh') 替代
 */
async function recordRefresh(userId) {
    return recordApiOperation(userId, 'plaid_refresh');
}
/**
 * ============================================
 * 管理員函數
 * ============================================
 */
/**
 * 更新用戶的訂閱等級
 * 驗證新等級的有效性，並記錄審計日誌
 */
async function updateUserTier(userId, newTier, adminId) {
    const dbStartTime = Date.now();
    // 驗證新等級是否有效
    const validTiers = ['Basic', 'Pro', 'Ultimate', 'VIP'];
    if (!validTiers.includes(newTier)) {
        throw new Error(`Invalid tier: ${newTier}. Valid tiers are: ${validTiers.join(', ')}`);
    }
    try {
        // 獲取當前等級
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { tier: true },
        });
        const previousTier = user?.tier || 'Basic';
        // 如果新等級與舊等級相同，直接返回
        if (previousTier === newTier) {
            (0, logger_1.logDebug)('User tier update: no change needed', {
                userId,
                currentTier: previousTier,
            });
            return { previousTier, newTier };
        }
        // 直接更新 User 資料表中的 tier 欄位
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                tier: newTier,
            },
        });
        (0, logger_1.logDatabaseOperation)('UPDATE', 'users', Date.now() - dbStartTime, true);
        (0, logger_1.logDebug)('User tier updated successfully', {
            userId,
            previousTier,
            newTier,
            adminId,
        });
        return { previousTier, newTier };
    }
    catch (error) {
        (0, logger_1.logDatabaseOperation)('UPDATE', 'users', Date.now() - dbStartTime, false);
        throw error;
    }
}
//# sourceMappingURL=apiRateLimitUtil.js.map