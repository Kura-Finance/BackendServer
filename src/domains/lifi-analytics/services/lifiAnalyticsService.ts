import { randomUUID } from 'crypto';
import { prisma } from '../../shared/lib/prisma';
import {
  buildLazySkip,
  getLifiTransfersMinIntervalMs,
  isWithinInterval,
  type LazyUpdateSkipped,
} from '../../shared/lib/lazyUpdate';
import { appLogger, logError } from '../../logger';
import { fetchDoneTransfers } from '../lib/lifiClient';
import type {
  LifiTransferStatus,
  LifiTransfersSummary,
  LifiTransfersSyncResult,
} from '../models/types';

const DEFAULT_WINDOW_DAYS = 30;

function defaultPeriod(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

function parseUsd(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** integrator / included:false 費用加總為 platformFee。 */
export function extractIntegratorFeeUsd(transfer: LifiTransferStatus): number | null {
  const fees = transfer.feeCosts;
  if (!fees?.length) return null;

  let total = 0;
  let found = false;
  for (const fee of fees) {
    const name = (fee.name ?? '').toLowerCase();
    const desc = (fee.description ?? '').toLowerCase();
    const isIntegrator =
      fee.included === false
      || name.includes('integrator')
      || desc.includes('integrator');
    if (!isIntegrator) continue;
    const usd = parseUsd(fee.amountUSD);
    if (usd == null) continue;
    total += usd;
    found = true;
  }
  return found ? Math.round(total * 100) / 100 : null;
}

async function resolveUserByAddress(
  address: string | null | undefined,
): Promise<{ userId: string | null; scaAddress: string | null }> {
  if (!address) return { userId: null, scaAddress: null };
  const normalized = address.trim().toLowerCase();
  if (!normalized) return { userId: null, scaAddress: null };

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ walletAddress: normalized }, { scaAddress: normalized }],
    },
    select: { id: true, scaAddress: true, walletAddress: true },
  });

  if (!user) {
    return { userId: null, scaAddress: normalized };
  }

  return {
    userId: user.id,
    scaAddress: user.scaAddress?.toLowerCase() ?? normalized,
  };
}

export class LifiAnalyticsService {
  static async syncTransfers(from?: string, to?: string): Promise<LifiTransfersSyncResult> {
    const period = defaultPeriod(from, to);
    const syncRunId = randomUUID();
    const fromTimestamp = Math.floor(period.from.getTime() / 1000);
    const toTimestamp = Math.floor(period.to.getTime() / 1000);

    const { integrators, transfers } = await fetchDoneTransfers({ fromTimestamp, toTimestamp });

    const { PlatformRecordService } = await import(
      '../../platform-insights/services/platformRevenueService'
    );

    let transferred = 0;
    for (const transfer of transfers) {
      if ((transfer.status ?? '').toUpperCase() !== 'DONE') continue;

      const txHash = transfer.sending?.txHash?.trim();
      const transactionId = transfer.transactionId?.trim();
      const idempotencyKey = txHash
        ? `lifi:tx:${txHash.toLowerCase()}`
        : transactionId
          ? `lifi:id:${transactionId}`
          : null;
      if (!idempotencyKey) {
        appLogger.warn('[LifiAnalyticsService] Skipping transfer without txHash/transactionId');
        continue;
      }

      const processAmount = parseUsd(transfer.sending?.amountUSD);
      if (processAmount == null || processAmount <= 0) {
        continue;
      }

      const platformFee = extractIntegratorFeeUsd(transfer);
      const { userId, scaAddress } = await resolveUserByAddress(transfer.fromAddress);
      const occurredAtSec = transfer.sending?.timestamp;
      const occurredAt =
        typeof occurredAtSec === 'number' && Number.isFinite(occurredAtSec)
          ? new Date(occurredAtSec * 1000)
          : period.to;

      await PlatformRecordService.recordFromLifiTransfer({
        userId,
        scaAddress,
        idempotencyKey,
        externalId: txHash ?? transactionId ?? null,
        processAmount,
        platformFee,
        occurredAt,
        metadata: {
          tool: transfer.tool ?? null,
          substatus: transfer.substatus ?? null,
          fromAddress: transfer.fromAddress ?? null,
          toAddress: transfer.toAddress ?? null,
          fromChainId: transfer.sending?.chainId ?? null,
          toChainId: transfer.receiving?.chainId ?? null,
          fromToken: transfer.sending?.token?.symbol ?? null,
          toToken: transfer.receiving?.token?.symbol ?? null,
          receivingAmountUsd: transfer.receiving?.amountUSD ?? null,
          lifiExplorerLink: transfer.lifiExplorerLink ?? null,
          transactionId: transfer.transactionId ?? null,
          integrator: transfer.metadata?.integrator ?? integrators[0] ?? null,
        },
      });
      transferred += 1;
    }

    await PlatformRecordService.record({
      category: 'revenue',
      source: 'lifi',
      eventType: 'lifi_transfers_synced',
      idempotencyKey: `lifi:sync:${syncRunId}`,
      processAmount: null,
      platformFee: null,
      netAmount: null,
      currency: 'usd',
      occurredAt: new Date(),
      referrable: false,
      metadata: {
        syncRunId,
        transferred,
        integrators,
        periodFrom: period.from.toISOString(),
        periodTo: period.to.toISOString(),
      },
    });

    appLogger.info('[LifiAnalyticsService] Transfers synced', {
      syncRunId,
      transferred,
      fetched: transfers.length,
      integrators,
    });

    return {
      syncRunId,
      transferred,
      periodFrom: period.from.toISOString(),
      periodTo: period.to.toISOString(),
      integrators,
    };
  }

  static async syncTransfersIfStale(options?: {
    force?: boolean;
    from?: string;
    to?: string;
  }): Promise<LazyUpdateSkipped | ({ skipped: false } & LifiTransfersSyncResult)> {
    const minIntervalMs = getLifiTransfersMinIntervalMs();

    if (!options?.force) {
      const lastSync = await prisma.platformRecord.findFirst({
        where: { source: 'lifi', eventType: 'lifi_transfers_synced' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      });

      if (isWithinInterval(lastSync?.occurredAt, minIntervalMs)) {
        return buildLazySkip({
          reason: 'fresh',
          lastUpdatedAt: lastSync?.occurredAt ?? null,
          minIntervalMs,
        });
      }
    }

    const result = await this.syncTransfers(options?.from, options?.to);
    return { skipped: false, ...result };
  }

  static async getTransfersSummary(from?: string, to?: string): Promise<LifiTransfersSummary> {
    const period = defaultPeriod(from, to);

    const [agg, lastSync, count] = await Promise.all([
      prisma.platformRecord.aggregate({
        where: {
          source: 'lifi',
          eventType: 'transfer_done',
          occurredAt: { gte: period.from, lte: period.to },
        },
        _sum: { processAmount: true, platformFee: true },
      }),
      prisma.platformRecord.findFirst({
        where: { source: 'lifi', eventType: 'lifi_transfers_synced' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      prisma.platformRecord.count({
        where: {
          source: 'lifi',
          eventType: 'transfer_done',
          occurredAt: { gte: period.from, lte: period.to },
        },
      }),
    ]);

    return {
      transferCount: count,
      processUsd: Math.round((agg._sum.processAmount ?? 0) * 100) / 100,
      platformFeeUsd: Math.round((agg._sum.platformFee ?? 0) * 100) / 100,
      periodFrom: period.from.toISOString(),
      periodTo: period.to.toISOString(),
      lastSyncedAt: lastSync?.occurredAt.toISOString() ?? null,
    };
  }

  /** 供 platform-insights backfill 呼叫（失敗不阻擋其他來源）。 */
  static async syncForBackfill(): Promise<number> {
    try {
      const result = await this.syncTransfers();
      return result.transferred;
    } catch (error) {
      logError('[LifiAnalyticsService] Backfill sync failed', error as Error);
      return 0;
    }
  }
}
