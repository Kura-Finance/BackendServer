import { prisma } from './prisma';
import { logDebug, logDatabaseOperation } from '../../logger';

/**
 * API 操作類型
 */
export type ApiOperationType = 'exchange_connect' | 'exchange_balance' | 'plaid_refresh' | 'debank_refresh';

/**
 * 每個等級允許的每日 API 操作限制
 *
 * - Kura Basic (免費版): 無限帳戶綁定，1 次/日手動同步
 * - Kura Pro (進階版): 無限帳戶綁定，5 次/日手動同步
 * - Kura Ultimate (旗艦版): 無限帳戶綁定，20 次/日高頻同步
 */
const API_LIMITS_BY_TIER: Record<ApiOperationType, Record<string, number>> = {
  // 帳戶綁定限制 (無上限綁定傳統銀行、信用卡、Web3 錢包地址)
  'exchange_connect': {
    'Basic': -1,
    'Pro': -1,
    'Ultimate': -1,
  },
  // 手動同步/查詢餘額限制 (API 調用計數)
  'exchange_balance': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
  },
  // Plaid 手動刷新限制 (銀行帳戶同步)
  'plaid_refresh': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
  },
  // DeBank 手動刷新限制（協議資料同步）
  'debank_refresh': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
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
};

/** TrackFi 加密資產歷史（GET /api/assets/history/encrypted）可查詢的最大天數 */
const ASSET_HISTORY_DAYS_BY_TIER: Record<string, number> = {
  Basic: 30,
  Pro: 365,
  Ultimate: 365,
};

/** Normalize stored tier strings (legacy VIP → Ultimate). */
export function normalizeTier(tier: string | null | undefined): string {
  if (!tier) return 'Basic';
  if (tier === 'VIP') return 'Ultimate';
  return tier;
}

/**
 * 獲取用戶的訂閱等級
 */
export async function getUserTier(userId: string): Promise<string> {
  const dbStartTime = Date.now();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    logDatabaseOperation('SELECT', 'users', Date.now() - dbStartTime, true);

    return normalizeTier(user?.tier);
  } catch (error) {
    logDatabaseOperation('SELECT', 'users', Date.now() - dbStartTime, false);
    logDebug(`Failed to fetch user tier, defaulting to Basic`, { userId, error });
    return 'Basic';
  }
}

/**
 * 獲取特定操作的每日限制
 */
export function getApiLimitForTier(operationType: ApiOperationType, tier: string): number {
  const limits = API_LIMITS_BY_TIER[operationType];
  return limits[tier as keyof typeof limits] ?? limits['Basic'] ?? 1;
}

/** TrackFi 歷史查詢天數上限（依訂閱等級；未知 tier 視同 Basic） */
export function getAssetHistoryDaysLimitForTier(tier: string): number {
  return ASSET_HISTORY_DAYS_BY_TIER[tier] ?? 30;
}

/** 將請求的 days 限制在 tier 上限與全域 365 天內 */
export function clampAssetHistoryDays(requestedDays: number, tier: string): number {
  const tierLimit = getAssetHistoryDaysLimitForTier(tier);
  return Math.min(requestedDays, tierLimit, 365);
}

/**
 * 取得今天的日期字串（YYYY-MM-DD）
 */
export function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

/**
 * 獲取用戶今天特定操作的次數
 */
export async function getTodayOperationCount(
  userId: string,
  operationType: ApiOperationType
): Promise<number> {
  const dbStartTime = Date.now();
  const today = getTodayDateString();

  try {
    const log = await prisma.apiOperationLog.findUnique({
      where: {
        userId_operationType_date: {
          userId,
          operationType,
          date: today,
        },
      },
      select: { count: true },
    });

    logDatabaseOperation(
      'SELECT',
      'api_operation_logs',
      Date.now() - dbStartTime,
      true
    );

    return log?.count || 0;
  } catch (error) {
    logDatabaseOperation(
      'SELECT',
      'api_operation_logs',
      Date.now() - dbStartTime,
      false
    );
    logDebug(`Failed to fetch operation count`, { userId, operationType, error });
    return 0;
  }
}

/**
 * 檢查用戶是否可以執行特定操作
 * @returns { canOperate: boolean, operationCountRemaining: number, operationLimit: number, message?: string }
 */
export async function checkApiLimit(
  userId: string,
  operationType: ApiOperationType
): Promise<{
  canOperate: boolean;
  operationCountRemaining: number;
  operationLimit: number;
  message?: string;
}> {
  const tier = await getUserTier(userId);
  const operationLimit = getApiLimitForTier(operationType, tier);

  // -1 = unlimited (e.g. exchange_connect)
  if (operationLimit === -1) {
    return {
      canOperate: true,
      operationCountRemaining: 999,
      operationLimit: -1,
    };
  }

  const todayOperationCount = await getTodayOperationCount(userId, operationType);
  const operationCountRemaining = Math.max(0, operationLimit - todayOperationCount);

  const operationNames: Record<ApiOperationType, string> = {
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
    message:
      operationCountRemaining > 0
        ? `You have ${operationCountRemaining} ${operationName} remaining today.`
        : `Daily ${operationName} limit reached. ${tier} users can perform ${operationLimit} per day.`,
  };
}

/**
 * 記錄一次 API 操作
 */
export async function recordApiOperation(
  userId: string,
  operationType: ApiOperationType
): Promise<void> {
  const dbStartTime = Date.now();
  const today = getTodayDateString();

  try {
    await prisma.apiOperationLog.upsert({
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

    logDatabaseOperation(
      'UPSERT',
      'api_operation_logs',
      Date.now() - dbStartTime,
      true
    );
    logDebug(`Recorded API operation for user`, { userId, operationType, today });
  } catch (error) {
    logDatabaseOperation(
      'UPSERT',
      'api_operation_logs',
      Date.now() - dbStartTime,
      false
    );
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
export function getRefreshLimitForTier(tier: string): number {
  return REFRESH_LIMITS_BY_TIER[tier as keyof typeof REFRESH_LIMITS_BY_TIER] ?? 1;
}

/**
 * 獲取用戶今天的 Plaid 刷新次數
 * @deprecated 使用 getTodayOperationCount(userId, 'plaid_refresh') 替代
 */
export async function getTodayRefreshCount(userId: string): Promise<number> {
  return getTodayOperationCount(userId, 'plaid_refresh');
}

/**
 * 檢查用戶是否可以執行 Plaid 刷新
 * @deprecated 使用 checkApiLimit(userId, 'plaid_refresh') 替代
 */
export async function checkRefreshLimit(userId: string): Promise<{
  canRefresh: boolean;
  refreshCountRemaining: number;
  refreshLimit: number;
  message?: string;
}> {
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
export async function recordRefresh(userId: string): Promise<void> {
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
export async function updateUserTier(
  userId: string,
  newTier: string,
  adminId?: string
): Promise<{ previousTier: string; newTier: string }> {
  const dbStartTime = Date.now();
  
  // 驗證新等級是否有效
  const validTiers = ['Basic', 'Pro', 'Ultimate'];
  if (!validTiers.includes(newTier)) {
    throw new Error(
      `Invalid tier: ${newTier}. Valid tiers are: ${validTiers.join(', ')}`
    );
  }

  try {
    // 獲取當前等級
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    const previousTier = user?.tier || 'Basic';

    // 如果新等級與舊等級相同，直接返回
    if (previousTier === newTier) {
      logDebug('User tier update: no change needed', {
        userId,
        currentTier: previousTier,
      });
      return { previousTier, newTier };
    }

    // 直接更新 User 資料表中的 tier 欄位
    await prisma.user.update({
      where: { id: userId },
      data: {
        tier: newTier,
      },
    });

    logDatabaseOperation('UPDATE', 'users', Date.now() - dbStartTime, true);
    logDebug('User tier updated successfully', {
      userId,
      previousTier,
      newTier,
      adminId,
    });

    return { previousTier, newTier };
  } catch (error) {
    logDatabaseOperation('UPDATE', 'users', Date.now() - dbStartTime, false);
    throw error;
  }
}
