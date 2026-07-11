import { prisma } from '../../shared/lib/prisma';
import { fetchDeBankWalletTotals } from '../../shared/lib/debankPlatformClient';
import {
  buildLazySkip,
  getScaScanMinIntervalMs,
  isWithinInterval,
  type LazyUpdateSkipped,
} from '../../shared/lib/lazyUpdate';
import { appLogger, logError } from '../../logger';
import type { ScaAumSummary } from '../models/types';

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBatchSize(): number {
  const configured = Number(process.env.SCA_SCAN_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_BATCH_SIZE;
}

function getBatchDelayMs(): number {
  const configured = Number(process.env.SCA_SCAN_BATCH_DELAY_MS || DEFAULT_BATCH_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : DEFAULT_BATCH_DELAY_MS;
}

export class ScaAnalyticsService {
  /** 掃描單一 SCA 並寫入快照。 */
  static async snapshotWallet(userId: string, scaAddress: string): Promise<number> {
    const totals = await fetchDeBankWalletTotals(scaAddress);
    const snapshot = await prisma.scaWalletSnapshot.create({
      data: {
        userId,
        scaAddress: scaAddress.toLowerCase(),
        spotUsd: totals.spotUsd,
        defiUsd: totals.defiUsd,
        totalUsd: totals.totalUsd,
        source: 'debank',
      },
    });

    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromScaSnapshot({
      userId,
      scaAddress,
      spotUsd: totals.spotUsd,
      defiUsd: totals.defiUsd,
      totalUsd: totals.totalUsd,
      snapshotAt: snapshot.snapshotAt,
      scaSnapshotId: snapshot.id,
    }).catch(() => {});

    return totals.totalUsd;
  }

  /** 掃描所有已註冊 SCA 的用戶（DeBank）。 */
  static async scanAllScaWalletsIfStale(options?: {
    force?: boolean;
  }): Promise<
    | LazyUpdateSkipped
    | {
        skipped: false;
        runId: string;
        walletsScanned: number;
        walletsFailed: number;
        totalAumUsd: number;
      }
  > {
    const minIntervalMs = getScaScanMinIntervalMs();

    if (!options?.force) {
      const [running, lastCompleted] = await Promise.all([
        prisma.scaScanRun.findFirst({
          where: { status: 'running' },
          orderBy: { startedAt: 'desc' },
          select: { startedAt: true },
        }),
        prisma.scaScanRun.findFirst({
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true },
        }),
      ]);

      if (running) {
        return buildLazySkip({
          reason: 'scan_in_progress',
          lastUpdatedAt: running.startedAt,
          minIntervalMs,
        });
      }

      if (isWithinInterval(lastCompleted?.completedAt, minIntervalMs)) {
        return buildLazySkip({
          reason: 'fresh',
          lastUpdatedAt: lastCompleted?.completedAt ?? null,
          minIntervalMs,
        });
      }
    }

    const result = await this.scanAllScaWallets();
    return { skipped: false, ...result };
  }

  /** 掃描所有已註冊 SCA 的用戶（DeBank）。 */
  static async scanAllScaWallets(): Promise<{
    runId: string;
    walletsScanned: number;
    walletsFailed: number;
    totalAumUsd: number;
  }> {
    const run = await prisma.scaScanRun.create({
      data: { status: 'running' },
    });

    const users = await prisma.user.findMany({
      where: { scaAddress: { not: null } },
      select: { id: true, scaAddress: true },
      orderBy: { createdAt: 'asc' },
    });

    let walletsScanned = 0;
    let walletsFailed = 0;
    let totalAumUsd = 0;
    const batchSize = getBatchSize();
    const batchDelayMs = getBatchDelayMs();

    try {
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (user) => {
            if (!user.scaAddress) return { ok: false as const, totalUsd: 0 };
            try {
              const totalUsd = await this.snapshotWallet(user.id, user.scaAddress);
              return { ok: true as const, totalUsd };
            } catch (error) {
              logError('[ScaAnalyticsService] Wallet scan failed', error as Error, {
                userId: user.id,
                scaAddress: user.scaAddress,
              });
              return { ok: false as const, totalUsd: 0 };
            }
          }),
        );

        for (const result of results) {
          if (result.ok) {
            walletsScanned += 1;
            totalAumUsd += result.totalUsd;
          } else {
            walletsFailed += 1;
          }
        }

        if (i + batchSize < users.length && batchDelayMs > 0) {
          await sleep(batchDelayMs);
        }
      }

      const roundedTotal = Math.round(totalAumUsd * 100) / 100;
      await prisma.scaScanRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          walletsScanned,
          walletsFailed,
          totalAumUsd: roundedTotal,
          completedAt: new Date(),
        },
      });

      appLogger.info('[ScaAnalyticsService] Scan completed', {
        runId: run.id,
        walletsScanned,
        walletsFailed,
        totalAumUsd: roundedTotal,
      });

      return {
        runId: run.id,
        walletsScanned,
        walletsFailed,
        totalAumUsd: roundedTotal,
      };
    } catch (error) {
      await prisma.scaScanRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          walletsScanned,
          walletsFailed,
          totalAumUsd: Math.round(totalAumUsd * 100) / 100,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  static async getAumSummary(): Promise<ScaAumSummary> {
    const latestByUser = await prisma.scaWalletSnapshot.findMany({
      orderBy: { snapshotAt: 'desc' },
      distinct: ['userId'],
      select: {
        spotUsd: true,
        defiUsd: true,
        totalUsd: true,
        snapshotAt: true,
      },
    });

    const lastScan = await prisma.scaScanRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    const spotUsd = latestByUser.reduce((sum, row) => sum + row.spotUsd, 0);
    const defiUsd = latestByUser.reduce((sum, row) => sum + row.defiUsd, 0);
    const totalUsd = latestByUser.reduce((sum, row) => sum + row.totalUsd, 0);

    return {
      totalUsd: Math.round(totalUsd * 100) / 100,
      spotUsd: Math.round(spotUsd * 100) / 100,
      defiUsd: Math.round(defiUsd * 100) / 100,
      walletCount: latestByUser.length,
      lastSnapshotAt: latestByUser[0]?.snapshotAt.toISOString() ?? null,
      lastScan: lastScan
        ? {
            id: lastScan.id,
            status: lastScan.status,
            walletsScanned: lastScan.walletsScanned,
            walletsFailed: lastScan.walletsFailed,
            totalAumUsd: lastScan.totalAumUsd,
            startedAt: lastScan.startedAt.toISOString(),
            completedAt: lastScan.completedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  static async listSnapshots(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    return prisma.scaWalletSnapshot.findMany({
      orderBy: { snapshotAt: 'desc' },
      take,
      select: {
        id: true,
        userId: true,
        scaAddress: true,
        spotUsd: true,
        defiUsd: true,
        totalUsd: true,
        snapshotAt: true,
      },
    });
  }
}
