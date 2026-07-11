import { randomUUID } from 'crypto';
import { fetchPrivyUserMetrics } from '../../auth/services/privyService';
import { prisma } from '../../shared/lib/prisma';
import {
  buildLazySkip,
  getPrivyMetricsMinIntervalMs,
  isWithinInterval,
  type LazyUpdateSkipped,
} from '../../shared/lib/lazyUpdate';
import { appLogger, logError } from '../../logger';
import type { PrivyActiveUsersSummary } from '../models/types';

const DEFAULT_ACTIVE_WINDOW_DAYS = 30;

function defaultMetricsPeriod(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

function parseSnapshotMetadata(metadata: unknown): {
  totalUsers: number;
  activeUsers: number;
  periodFrom: string;
  periodTo: string;
} | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const row = metadata as Record<string, unknown>;
  if (
    typeof row.totalUsers !== 'number' ||
    typeof row.activeUsers !== 'number' ||
    typeof row.periodFrom !== 'string' ||
    typeof row.periodTo !== 'string'
  ) {
    return null;
  }
  return {
    totalUsers: row.totalUsers,
    activeUsers: row.activeUsers,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
  };
}

export class PrivyAnalyticsService {
  /** 從 Privy 同步活躍用戶統計並寫入 PlatformRecord。 */
  static async syncActiveUsers(from?: string, to?: string): Promise<{
    syncRunId: string;
    totalUsers: number;
    activeUsers: number;
    periodFrom: string;
    periodTo: string;
  }> {
    const period = defaultMetricsPeriod(from, to);
    const metrics = await fetchPrivyUserMetrics(period.from, period.to);
    const syncRunId = randomUUID();

    const { PlatformRecordService } = await import(
      '../../platform-insights/services/platformRevenueService'
    );
    await PlatformRecordService.recordFromPrivyMetrics({
      syncRunId,
      totalUsers: metrics.totalUsers,
      activeUsers: metrics.activeUsers,
      periodFrom: metrics.periodFrom,
      periodTo: metrics.periodTo,
      syncedAt: metrics.syncedAt,
    });

    appLogger.info('[PrivyAnalyticsService] Active users synced', {
      syncRunId,
      totalUsers: metrics.totalUsers,
      activeUsers: metrics.activeUsers,
    });

    return {
      syncRunId,
      totalUsers: metrics.totalUsers,
      activeUsers: metrics.activeUsers,
      periodFrom: metrics.periodFrom.toISOString(),
      periodTo: metrics.periodTo.toISOString(),
    };
  }

  static async syncActiveUsersIfStale(options?: {
    force?: boolean;
    from?: string;
    to?: string;
  }): Promise<
    | LazyUpdateSkipped
    | {
        skipped: false;
        syncRunId: string;
        totalUsers: number;
        activeUsers: number;
        periodFrom: string;
        periodTo: string;
      }
  > {
    const minIntervalMs = getPrivyMetricsMinIntervalMs();

    if (!options?.force) {
      const lastSnapshot = await prisma.platformRecord.findFirst({
        where: { category: 'active_users', eventType: 'privy_metrics_snapshot' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      });

      if (isWithinInterval(lastSnapshot?.occurredAt, minIntervalMs)) {
        return buildLazySkip({
          reason: 'fresh',
          lastUpdatedAt: lastSnapshot?.occurredAt ?? null,
          minIntervalMs,
        });
      }
    }

    const result = await this.syncActiveUsers(options?.from, options?.to);
    return { skipped: false, ...result };
  }

  static async getActiveUsersSummary(from?: string, to?: string): Promise<PrivyActiveUsersSummary> {
    const period = defaultMetricsPeriod(from, to);
    const latest = await prisma.platformRecord.findFirst({
      where: { category: 'active_users', eventType: 'privy_metrics_snapshot' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true, metadata: true },
    });

    const parsed = parseSnapshotMetadata(latest?.metadata);
    if (parsed) {
      return {
        totalUsers: parsed.totalUsers,
        activeUsers: parsed.activeUsers,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        lastSyncedAt: latest?.occurredAt.toISOString() ?? null,
      };
    }

    try {
      const synced = await this.syncActiveUsers(from, to);
      return {
        totalUsers: synced.totalUsers,
        activeUsers: synced.activeUsers,
        periodFrom: synced.periodFrom,
        periodTo: synced.periodTo,
        lastSyncedAt: new Date().toISOString(),
      };
    } catch (error) {
      logError('[PrivyAnalyticsService] Failed to fetch active users summary', error as Error, {
        periodFrom: period.from.toISOString(),
        periodTo: period.to.toISOString(),
      });
      throw error;
    }
  }
}
