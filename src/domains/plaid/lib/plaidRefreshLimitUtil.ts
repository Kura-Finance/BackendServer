import { prisma } from '../../shared/lib/prisma';
import { logDebug, logDatabaseOperation } from '../../logger';

/**
 * 每個等級允許的每日刷新次數
 */
const REFRESH_LIMITS_BY_TIER = {
  'Basic': 1,
  'Pro': 5,
  'Ultimate': 20,
  'VIP': -1, // -1 表示無限制
};

/**
 * 獲取用戶的訂閱等級
 */
export async function getUserTier(userId: string): Promise<string> {
  const dbStartTime = Date.now();
  
  try {
    const rewardProfile = await prisma.rewardProfile.findUnique({
      where: { userId },
      select: { tier: true },
    });
    
    logDatabaseOperation('SELECT', 'reward_profiles', Date.now() - dbStartTime, true);
    
    return rewardProfile?.tier || 'Basic'; // 預設為 Basic 如果沒有 RewardProfile
  } catch (error) {
    logDatabaseOperation('SELECT', 'reward_profiles', Date.now() - dbStartTime, false);
    logDebug(`Failed to fetch user tier, defaulting to Basic`, { userId, error });
    return 'Basic';
  }
}

/**
 * 獲取用戶的每日刷新限制
 */
export function getRefreshLimitForTier(tier: string): number {
  return REFRESH_LIMITS_BY_TIER[tier as keyof typeof REFRESH_LIMITS_BY_TIER] ?? 1;
}

/**
 * 獲取今天的日期字符串 (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

/**
 * 獲取用戶今天的刷新次數
 */
export async function getTodayRefreshCount(userId: string): Promise<number> {
  const dbStartTime = Date.now();
  const today = getTodayDateString();
  
  try {
    const refreshLog = await prisma.plaidRefreshLog.findUnique({
      where: {
        userId_refreshDate: {
          userId,
          refreshDate: today,
        },
      },
      select: { refreshCount: true },
    });
    
    logDatabaseOperation('SELECT', 'plaid_refresh_log', Date.now() - dbStartTime, true);
    
    return refreshLog?.refreshCount || 0;
  } catch (error) {
    logDatabaseOperation('SELECT', 'plaid_refresh_log', Date.now() - dbStartTime, false);
    logDebug(`Failed to fetch refresh count`, { userId, error });
    return 0;
  }
}

/**
 * 檢查用戶是否可以執行強制刷新
 * @returns { canRefresh: boolean, refreshCountRemaining: number, refreshLimit: number, message?: string }
 */
export async function checkRefreshLimit(userId: string): Promise<{
  canRefresh: boolean;
  refreshCountRemaining: number;
  refreshLimit: number;
  message?: string;
}> {
  const tier = await getUserTier(userId);
  const refreshLimit = getRefreshLimitForTier(tier);
  
  // VIP 用戶無限制
  if (refreshLimit === -1) {
    return {
      canRefresh: true,
      refreshCountRemaining: 999, // 任意大的數字表示無限制
      refreshLimit: -1,
    };
  }

  const todayRefreshCount = await getTodayRefreshCount(userId);
  const refreshCountRemaining = Math.max(0, refreshLimit - todayRefreshCount);
  
  return {
    canRefresh: refreshCountRemaining > 0,
    refreshCountRemaining,
    refreshLimit,
    message:
      refreshCountRemaining > 0
        ? `您今天還有 ${refreshCountRemaining} 次刷新次數`
        : `您今天已達到刷新限制。${tier} 用戶每天可刷新 ${refreshLimit} 次`,
  };
}

/**
 * 記錄一次刷新操作
 */
export async function recordRefresh(userId: string): Promise<void> {
  const dbStartTime = Date.now();
  const today = getTodayDateString();

  try {
    await prisma.plaidRefreshLog.upsert({
      where: {
        userId_refreshDate: {
          userId,
          refreshDate: today,
        },
      },
      update: {
        refreshCount: {
          increment: 1,
        },
      },
      create: {
        userId,
        refreshDate: today,
        refreshCount: 1,
      },
    });
    
    logDatabaseOperation('UPSERT', 'plaid_refresh_log', Date.now() - dbStartTime, true);
    logDebug(`Recorded refresh for user`, { userId, today });
  } catch (error) {
    logDatabaseOperation('UPSERT', 'plaid_refresh_log', Date.now() - dbStartTime, false);
    throw error;
  }
}
