const DEFAULT_PRIVY_METRICS_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const DEFAULT_PLATFORM_BACKFILL_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1h
const DEFAULT_LIFI_TRANSFERS_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1h
const DEFAULT_BRIDGE_FUNDS_REQUESTS_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5m

function parseIntervalMs(envValue: string | undefined, fallback: number): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getPrivyMetricsMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.PRIVY_METRICS_MIN_INTERVAL_MS,
    DEFAULT_PRIVY_METRICS_MIN_INTERVAL_MS,
  );
}

export function getPlatformBackfillMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.PLATFORM_BACKFILL_MIN_INTERVAL_MS,
    DEFAULT_PLATFORM_BACKFILL_MIN_INTERVAL_MS,
  );
}

export function getLifiTransfersMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.LIFI_TRANSFERS_MIN_INTERVAL_MS,
    DEFAULT_LIFI_TRANSFERS_MIN_INTERVAL_MS,
  );
}

export function getBridgeFundsRequestsSyncMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.BRIDGE_FUNDS_REQUESTS_SYNC_MIN_INTERVAL_MS,
    DEFAULT_BRIDGE_FUNDS_REQUESTS_SYNC_MIN_INTERVAL_MS,
  );
}

const DEFAULT_BRIDGE_DEPOSITS_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000; // 2m
const DEFAULT_BRIDGE_DEPOSITS_PENDING_SYNC_MIN_INTERVAL_MS = 30 * 1000; // 30s

export function getBridgeDepositsSyncMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.BRIDGE_DEPOSITS_SYNC_MIN_INTERVAL_MS,
    DEFAULT_BRIDGE_DEPOSITS_SYNC_MIN_INTERVAL_MS,
  );
}

export function getBridgeDepositsPendingSyncMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.BRIDGE_DEPOSITS_PENDING_SYNC_MIN_INTERVAL_MS,
    DEFAULT_BRIDGE_DEPOSITS_PENDING_SYNC_MIN_INTERVAL_MS,
  );
}

export type LazyUpdateSkipReason = 'fresh';

export interface LazyUpdateSkipped {
  skipped: true;
  reason: LazyUpdateSkipReason;
  lastUpdatedAt: string | null;
  nextEligibleAt: string | null;
  minIntervalMs: number;
}

export function buildLazySkip(params: {
  reason: LazyUpdateSkipReason;
  lastUpdatedAt: Date | null;
  minIntervalMs: number;
}): LazyUpdateSkipped {
  const lastUpdatedAt = params.lastUpdatedAt?.toISOString() ?? null;
  const nextEligibleAt =
    params.lastUpdatedAt && params.minIntervalMs > 0
      ? new Date(params.lastUpdatedAt.getTime() + params.minIntervalMs).toISOString()
      : null;

  return {
    skipped: true,
    reason: params.reason,
    lastUpdatedAt,
    nextEligibleAt,
    minIntervalMs: params.minIntervalMs,
  };
}

export function isWithinInterval(lastAt: Date | null | undefined, minIntervalMs: number): boolean {
  if (!lastAt || minIntervalMs <= 0) return false;
  return Date.now() - lastAt.getTime() < minIntervalMs;
}
