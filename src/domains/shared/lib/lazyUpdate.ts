const DEFAULT_SCA_SCAN_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const DEFAULT_PLATFORM_BACKFILL_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1h

function parseIntervalMs(envValue: string | undefined, fallback: number): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getScaScanMinIntervalMs(): number {
  return parseIntervalMs(process.env.SCA_SCAN_MIN_INTERVAL_MS, DEFAULT_SCA_SCAN_MIN_INTERVAL_MS);
}

export function getPlatformBackfillMinIntervalMs(): number {
  return parseIntervalMs(
    process.env.PLATFORM_BACKFILL_MIN_INTERVAL_MS,
    DEFAULT_PLATFORM_BACKFILL_MIN_INTERVAL_MS,
  );
}

export type LazyUpdateSkipReason = 'fresh' | 'scan_in_progress';

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
