import { prisma } from './prisma';
import { logDebug, logDatabaseOperation } from '../../logger';

/** API operation types subject to daily tier limits. */
export type ApiOperationType = 'exchange_connect' | 'exchange_balance' | 'plaid_refresh' | 'debank_refresh';

/**
 * Daily API operation limits by subscription tier.
 *
 * - Kura Basic (free): unlimited account links, 1 manual sync / day
 * - Kura Pro: unlimited account links, 5 manual syncs / day
 * - Kura Ultimate: unlimited account links, 20 high-frequency syncs / day
 */
const API_LIMITS_BY_TIER: Record<ApiOperationType, Record<string, number>> = {
  // Account-link limits (unlimited bank / card / Web3 wallet links)
  'exchange_connect': {
    'Basic': -1,
    'Pro': -1,
    'Ultimate': -1,
  },
  // Manual sync / balance-query limits (API call counts)
  'exchange_balance': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
  },
  // Plaid manual refresh limits (bank account sync)
  'plaid_refresh': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
  },
  // DeBank manual refresh limits (protocol data sync)
  'debank_refresh': {
    'Basic': 1,
    'Pro': 5,
    'Ultimate': 20,
  },
};

/**
 * Plaid refresh limits (backward compat).
 * @deprecated Prefer checkApiLimit(userId, 'plaid_refresh')
 */
const REFRESH_LIMITS_BY_TIER = {
  'Basic': 1,
  'Pro': 5,
  'Ultimate': 20,
};

/** Max days for TrackFi encrypted asset history (GET /api/assets/history/encrypted). */
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

/** Fetch the user's subscription tier (defaults to Basic). */
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

/** Daily limit for an operation type at the given tier. */
export function getApiLimitForTier(operationType: ApiOperationType, tier: string): number {
  const limits = API_LIMITS_BY_TIER[operationType];
  return limits[tier as keyof typeof limits] ?? limits['Basic'] ?? 1;
}

/** TrackFi history day cap by tier (unknown tier → Basic). */
export function getAssetHistoryDaysLimitForTier(tier: string): number {
  return ASSET_HISTORY_DAYS_BY_TIER[tier] ?? 30;
}

/** Clamp requested days to the tier cap and a global 365-day max. */
export function clampAssetHistoryDays(requestedDays: number, tier: string): number {
  const tierLimit = getAssetHistoryDaysLimitForTier(tier);
  return Math.min(requestedDays, tierLimit, 365);
}

/** Today's date as YYYY-MM-DD (UTC). */
export function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

/** Count of a given operation for the user today. */
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
 * Whether the user may perform the operation under today's quota.
 * @returns { canOperate, operationCountRemaining, operationLimit, message? }
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

/** Record one API operation against today's quota. */
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
 * Plaid-specific helpers (backward compat).
 * @deprecated Prefer the generic API operation helpers
 */

/**
 * User's daily Plaid refresh limit.
 * @deprecated Prefer getApiLimitForTier('plaid_refresh', tier)
 */
export function getRefreshLimitForTier(tier: string): number {
  return REFRESH_LIMITS_BY_TIER[tier as keyof typeof REFRESH_LIMITS_BY_TIER] ?? 1;
}

/**
 * User's Plaid refresh count today.
 * @deprecated Prefer getTodayOperationCount(userId, 'plaid_refresh')
 */
export async function getTodayRefreshCount(userId: string): Promise<number> {
  return getTodayOperationCount(userId, 'plaid_refresh');
}

/**
 * Whether the user may run a Plaid refresh.
 * @deprecated Prefer checkApiLimit(userId, 'plaid_refresh')
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
 * Record one Plaid refresh.
 * @deprecated Prefer recordApiOperation(userId, 'plaid_refresh')
 */
export async function recordRefresh(userId: string): Promise<void> {
  return recordApiOperation(userId, 'plaid_refresh');
}

// ── Admin helpers ──────────────────────────────────────────────────

/**
 * Update a user's subscription tier.
 * Validates the new tier and writes an audit log entry.
 */
export async function updateUserTier(
  userId: string,
  newTier: string,
  adminId?: string
): Promise<{ previousTier: string; newTier: string }> {
  const dbStartTime = Date.now();
  
  // Validate new tier
  const validTiers = ['Basic', 'Pro', 'Ultimate'];
  if (!validTiers.includes(newTier)) {
    throw new Error(
      `Invalid tier: ${newTier}. Valid tiers are: ${validTiers.join(', ')}`
    );
  }

  try {
    // Current tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    const previousTier = user?.tier || 'Basic';

    // No-op if unchanged
    if (previousTier === newTier) {
      logDebug('User tier update: no change needed', {
        userId,
        currentTier: previousTier,
      });
      return { previousTier, newTier };
    }

    // Update User.tier
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
