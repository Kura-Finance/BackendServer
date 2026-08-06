/**
 * Admin dashboard read APIs — users, overview, FeeWarp Earn, Li.Fi summary.
 * Aggregates User / KYC relations, PlatformRecord revenue, and Morpho Earn AUM.
 */

import { prisma } from '../../shared/lib/prisma';
import {
  fetchEarnManagedAssets,
} from '../../platform-insights/lib/morphoEarn';
import {
  EARN_PERFORMANCE_FEE_BPS,
  isBridgeRevenueSource,
  isDinariRevenueSource,
  roundUsd,
} from '../../platform-insights/lib/revenuePolicy';
import { BridgeFraudRateService } from '../../bridge/services/bridgeFraudRateService';
import type {
  AdminUser,
  BridgeKycStatus,
  DinariKycStatus,
  FeeWarpVault,
  LifiAdminSummary,
  OverviewMetrics,
  RevenueActivity,
  UserTier,
} from '../models/types';

const BRIDGE_KYC_PENDING = new Set<string>([
  'under_review',
  'incomplete',
  'awaiting_questionnaire',
  'awaiting_ubo',
]);

const BRIDGE_KYC_STATUSES = new Set<string>([
  'not_started',
  'incomplete',
  'awaiting_questionnaire',
  'awaiting_ubo',
  'under_review',
  'approved',
  'rejected',
  'paused',
  'offboarded',
]);

const DINARI_KYC_STATUSES = new Set<string>([
  'not_started',
  'PENDING',
  'PASS',
  'REJECTED',
  'APPROVED',
]);

type RevenueBucket = { volumeUsd: number; feeUsd: number; count: number };

function emptyBucket(): RevenueBucket {
  return { volumeUsd: 0, feeUsd: 0, count: 0 };
}

function toRevenueActivity(bucket: RevenueBucket): RevenueActivity {
  return {
    volumeUsd: roundUsd(bucket.volumeUsd),
    feeUsd: roundUsd(bucket.feeUsd),
    count: bucket.count,
  };
}

function normalizeTier(tier: string | null | undefined): UserTier {
  if (tier === 'Pro' || tier === 'Ultimate' || tier === 'Basic') return tier;
  return 'Basic';
}

function normalizeBridgeKyc(status: string | null | undefined): BridgeKycStatus {
  if (status && BRIDGE_KYC_STATUSES.has(status)) {
    return status as BridgeKycStatus;
  }
  return 'not_started';
}

function normalizeDinariKyc(status: string | null | undefined): DinariKycStatus {
  if (status && DINARI_KYC_STATUSES.has(status)) {
    return status as DinariKycStatus;
  }
  // Dinari SDK may return FAIL; map to REJECTED for the dashboard union.
  if (status === 'FAIL') return 'REJECTED';
  return 'not_started';
}

function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  walletAddress: string | null;
  scaAddress: string | null;
  fraudSuspendedAt: Date | null;
  fraudSuspendReason: string | null;
  createdAt: Date;
  bridgeCustomer: { kycStatus: string } | null;
  dinariEntity: { kycStatus: string } | null;
};

function toAdminUser(
  user: UserRow,
  bridge: RevenueActivity,
  dinari: RevenueActivity,
): AdminUser {
  return {
    id: user.id,
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
    tier: normalizeTier(user.tier),
    eoaAddress: user.walletAddress,
    scaAddress: user.scaAddress,
    bridgeKyc: normalizeBridgeKyc(user.bridgeCustomer?.kycStatus),
    dinariKyc: normalizeDinariKyc(user.dinariEntity?.kycStatus),
    walletBalanceUsd: 0,
    bridge,
    dinari,
    fraudSuspended: Boolean(user.fraudSuspendedAt),
    fraudSuspendReason: user.fraudSuspendReason,
    createdAt: user.createdAt.toISOString(),
  };
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  tier: true,
  walletAddress: true,
  scaAddress: true,
  fraudSuspendedAt: true,
  fraudSuspendReason: true,
  createdAt: true,
  bridgeCustomer: { select: { kycStatus: true } },
  dinariEntity: { select: { kycStatus: true } },
} as const;

/** Load per-user Bridge / Dinari revenue maps from PlatformRecord (all-time). */
async function loadUserRevenueMaps(): Promise<{
  bridgeByUser: Map<string, RevenueBucket>;
  dinariByUser: Map<string, RevenueBucket>;
}> {
  const rows = await prisma.platformRecord.groupBy({
    by: ['userId', 'source'],
    where: {
      category: 'revenue',
      userId: { not: null },
      OR: [
        { source: { startsWith: 'bridge_' } },
        { source: 'dinari' },
      ],
    },
    _sum: { processAmount: true, platformFee: true },
    _count: { _all: true },
  });

  const bridgeByUser = new Map<string, RevenueBucket>();
  const dinariByUser = new Map<string, RevenueBucket>();

  for (const row of rows) {
    if (!row.userId) continue;
    const volume = row._sum.processAmount ?? 0;
    const fee = row._sum.platformFee ?? 0;
    const count = row._count._all;

    if (isBridgeRevenueSource(row.source)) {
      const bucket = bridgeByUser.get(row.userId) ?? emptyBucket();
      bucket.volumeUsd += volume;
      bucket.feeUsd += fee;
      bucket.count += count;
      bridgeByUser.set(row.userId, bucket);
    } else if (isDinariRevenueSource(row.source)) {
      const bucket = dinariByUser.get(row.userId) ?? emptyBucket();
      bucket.volumeUsd += volume;
      bucket.feeUsd += fee;
      bucket.count += count;
      dinariByUser.set(row.userId, bucket);
    }
  }

  return { bridgeByUser, dinariByUser };
}

/** Platform-wide Bridge / Dinari revenue totals (all-time). */
async function loadPlatformRevenueTotals(): Promise<{
  bridge: RevenueBucket;
  dinari: RevenueBucket;
}> {
  const rows = await prisma.platformRecord.groupBy({
    by: ['source'],
    where: {
      category: 'revenue',
      OR: [
        { source: { startsWith: 'bridge_' } },
        { source: 'dinari' },
      ],
    },
    _sum: { processAmount: true, platformFee: true },
    _count: { _all: true },
  });

  const bridge = emptyBucket();
  const dinari = emptyBucket();

  for (const row of rows) {
    const volume = row._sum.processAmount ?? 0;
    const fee = row._sum.platformFee ?? 0;
    const count = row._count._all;

    if (isBridgeRevenueSource(row.source)) {
      bridge.volumeUsd += volume;
      bridge.feeUsd += fee;
      bridge.count += count;
    } else if (isDinariRevenueSource(row.source)) {
      dinari.volumeUsd += volume;
      dinari.feeUsd += fee;
      dinari.count += count;
    }
  }

  return { bridge, dinari };
}

/** Li.Fi transfer_done only — excludes sync marker rows from counts. */
async function loadLifiTransferTotals(): Promise<RevenueBucket> {
  const [agg, count] = await Promise.all([
    prisma.platformRecord.aggregate({
      where: {
        source: 'lifi',
        eventType: 'transfer_done',
      },
      _sum: { processAmount: true, platformFee: true },
    }),
    prisma.platformRecord.count({
      where: {
        source: 'lifi',
        eventType: 'transfer_done',
      },
    }),
  ]);

  return {
    volumeUsd: agg._sum.processAmount ?? 0,
    feeUsd: agg._sum.platformFee ?? 0,
    count,
  };
}

async function mapFeeWarps(): Promise<FeeWarpVault[]> {
  const earn = await fetchEarnManagedAssets();
  return earn.vaults.map((vault) => ({
    wrapperAddress: vault.feeWrapperAddress,
    innerVaultAddress: vault.innerVaultAddress,
    label: vault.name ?? vault.symbol ?? `${shortAddress(vault.feeWrapperAddress)} FeeWarp`,
    mau: 0,
    tvlUsd: vault.totalAssetsUsd,
    performanceFeeBps: EARN_PERFORMANCE_FEE_BPS,
  }));
}

export class AdminDashboardService {
  static async listUsers(): Promise<AdminUser[]> {
    const [users, { bridgeByUser, dinariByUser }] = await Promise.all([
      prisma.user.findMany({
        select: userSelect,
        orderBy: { createdAt: 'desc' },
      }),
      loadUserRevenueMaps(),
    ]);

    return users.map((user) =>
      toAdminUser(
        user,
        toRevenueActivity(bridgeByUser.get(user.id) ?? emptyBucket()),
        toRevenueActivity(dinariByUser.get(user.id) ?? emptyBucket()),
      ),
    );
  }

  static async getUser(id: string): Promise<AdminUser | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) return null;

    const rows = await prisma.platformRecord.groupBy({
      by: ['source'],
      where: {
        category: 'revenue',
        userId: id,
        OR: [
          { source: { startsWith: 'bridge_' } },
          { source: 'dinari' },
        ],
      },
      _sum: { processAmount: true, platformFee: true },
      _count: { _all: true },
    });

    const bridge = emptyBucket();
    const dinari = emptyBucket();
    for (const row of rows) {
      const volume = row._sum.processAmount ?? 0;
      const fee = row._sum.platformFee ?? 0;
      const count = row._count._all;
      if (isBridgeRevenueSource(row.source)) {
        bridge.volumeUsd += volume;
        bridge.feeUsd += fee;
        bridge.count += count;
      } else if (isDinariRevenueSource(row.source)) {
        dinari.volumeUsd += volume;
        dinari.feeUsd += fee;
        dinari.count += count;
      }
    }

    return toAdminUser(user, toRevenueActivity(bridge), toRevenueActivity(dinari));
  }

  static async getFeeWarps(): Promise<FeeWarpVault[]> {
    return mapFeeWarps();
  }

  static async getLifiSummary(): Promise<LifiAdminSummary> {
    const lifi = await loadLifiTransferTotals();
    return {
      volumeUsd: roundUsd(lifi.volumeUsd),
      feeUsd: roundUsd(lifi.feeUsd),
      transferCount: lifi.count,
    };
  }

  static async getOverview(): Promise<OverviewMetrics> {
    const [totalUsers, usersWithKyc, platform, lifi, feeWarps, fraudRate] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.findMany({
          select: {
            bridgeCustomer: { select: { kycStatus: true } },
            dinariEntity: { select: { kycStatus: true } },
          },
        }),
        loadPlatformRevenueTotals(),
        loadLifiTransferTotals(),
        mapFeeWarps(),
        BridgeFraudRateService.getMonthSummary(),
      ]);

    let bridgeKycApproved = 0;
    let bridgeKycPending = 0;
    let bridgeKycRejected = 0;
    let bridgeKycNotStarted = 0;
    let dinariKycPassed = 0;

    for (const user of usersWithKyc) {
      const bridgeKyc = normalizeBridgeKyc(user.bridgeCustomer?.kycStatus);
      if (bridgeKyc === 'approved') bridgeKycApproved += 1;
      else if (BRIDGE_KYC_PENDING.has(bridgeKyc)) bridgeKycPending += 1;
      else if (bridgeKyc === 'rejected' || bridgeKyc === 'offboarded') bridgeKycRejected += 1;
      else if (bridgeKyc === 'not_started') bridgeKycNotStarted += 1;

      if (normalizeDinariKyc(user.dinariEntity?.kycStatus) === 'PASS') {
        dinariKycPassed += 1;
      }
    }

    const feeWarpTvlUsd = roundUsd(feeWarps.reduce((sum, v) => sum + v.tvlUsd, 0));

    return {
      totalUsers,
      bridgeKycApproved,
      bridgeKycPending,
      bridgeKycRejected,
      bridgeKycNotStarted,
      bridgeKycRate: totalUsers ? bridgeKycApproved / totalUsers : 0,
      bridgeVolumeUsd: roundUsd(platform.bridge.volumeUsd),
      bridgeFeeUsd: roundUsd(platform.bridge.feeUsd),
      bridgeTransferCount: platform.bridge.count,
      dinariKycPassed,
      dinariVolumeUsd: roundUsd(platform.dinari.volumeUsd),
      dinariFeeUsd: roundUsd(platform.dinari.feeUsd),
      dinariOrderCount: platform.dinari.count,
      lifiVolumeUsd: roundUsd(lifi.volumeUsd),
      lifiFeeUsd: roundUsd(lifi.feeUsd),
      lifiTransferCount: lifi.count,
      totalWalletBalanceUsd: 0,
      feeWarpMauTotal: 0,
      feeWarpTvlUsd,
      bridgeFraud: {
        month: fraudRate.month,
        openFraudAlerts: fraudRate.openFraudAlerts,
        combinedCountRateBps: fraudRate.combined.countRateBps,
        combinedVolumeRateBps: fraudRate.combined.volumeRateBps,
        inPenaltyBoxRisk: fraudRate.inPenaltyBoxRisk,
        inCriticalRisk: fraudRate.inCriticalRisk,
      },
    };
  }
}
