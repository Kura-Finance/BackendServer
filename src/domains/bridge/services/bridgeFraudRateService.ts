/**
 * Monthly Bridge fraud rate (Penalty Box: 50 bps / critical 7%).
 * US: fraud attributed to deposit month; EUR: attributed to recall (notice) month.
 */

import { prisma } from '../../shared/lib/prisma';
import type {
  BridgeFraudRateBucket,
  BridgeFraudRateMonthSummary,
} from '../models/types';

/** Penalty Box enrollment threshold (0.5%). */
export const BRIDGE_FRAUD_PENALTY_BOX_BPS = 50;
/** Excessive fraud — lose fiat rails (7%). */
export const BRIDGE_FRAUD_CRITICAL_BPS = 700;

type RailRegion = 'us' | 'eur' | 'other';

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAmount(value: string | null | undefined): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthBounds(month: string): { from: Date; to: Date; month: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('month must be YYYY-MM'), {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { from, to, month };
}

function defaultMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function classifyBridgeRegion(
  currency: string | null | undefined,
  paymentRail?: string | null,
): RailRegion {
  const c = (currency ?? '').trim().toLowerCase();
  const rail = (paymentRail ?? '').trim().toLowerCase();

  if (
    rail.includes('sepa')
    || rail === 'eur'
    || c === 'eur'
    || c === 'eurc'
  ) {
    return 'eur';
  }
  if (
    rail.includes('ach')
    || rail.includes('wire')
    || rail === 'rtp'
    || c === 'usd'
    || c === 'usdc'
    || c === 'usdb'
    || c === 'usdt'
  ) {
    return 'us';
  }
  if (c === 'mxn' || rail.includes('spei')) return 'other';
  if (c) return 'other';
  return 'other';
}

function emptyBucket(): BridgeFraudRateBucket {
  return {
    fraudCount: 0,
    fraudVolumeUsd: 0,
    depositCount: 0,
    depositVolumeUsd: 0,
    countRate: 0,
    volumeRate: 0,
    countRateBps: 0,
    volumeRateBps: 0,
    exceedsPenaltyBox: false,
    exceedsCritical: false,
  };
}

function finalizeBucket(bucket: BridgeFraudRateBucket): BridgeFraudRateBucket {
  const countRate = bucket.depositCount > 0
    ? bucket.fraudCount / bucket.depositCount
    : 0;
  const volumeRate = bucket.depositVolumeUsd > 0
    ? bucket.fraudVolumeUsd / bucket.depositVolumeUsd
    : 0;
  const countRateBps = Math.round(countRate * 10_000);
  const volumeRateBps = Math.round(volumeRate * 10_000);
  return {
    ...bucket,
    fraudVolumeUsd: roundUsd(bucket.fraudVolumeUsd),
    depositVolumeUsd: roundUsd(bucket.depositVolumeUsd),
    countRate,
    volumeRate,
    countRateBps,
    volumeRateBps,
    exceedsPenaltyBox:
      countRateBps > BRIDGE_FRAUD_PENALTY_BOX_BPS
      || volumeRateBps > BRIDGE_FRAUD_PENALTY_BOX_BPS,
    exceedsCritical:
      countRateBps >= BRIDGE_FRAUD_CRITICAL_BPS
      || volumeRateBps >= BRIDGE_FRAUD_CRITICAL_BPS,
  };
}

export class BridgeFraudRateService {
  static async getMonthSummary(month?: string): Promise<BridgeFraudRateMonthSummary> {
    const { from, to, month: monthKey } = monthBounds(month ?? defaultMonth());

    const [fraudRows, depositEvents] = await Promise.all([
      prisma.bridgeFundsRequest.findMany({
        where: { fraud: true },
        select: {
          amount: true,
          currency: true,
          noticeCreatedAt: true,
          depositCreatedAt: true,
          raw: true,
        },
      }),
      prisma.bridgeVirtualAccountEvent.findMany({
        where: {
          type: 'funds_received',
          occurredAt: { gte: from, lt: to },
          depositId: { not: null },
        },
        select: {
          depositId: true,
          amount: true,
          currency: true,
          source: true,
        },
      }),
    ]);

    const us = emptyBucket();
    const eur = emptyBucket();
    const other = emptyBucket();

    const inRange = (d: Date | null | undefined) =>
      Boolean(d && d >= from && d < to);

    for (const row of fraudRows) {
      const raw = (row.raw && typeof row.raw === 'object' ? row.raw : {}) as Record<
        string,
        unknown
      >;
      const paymentRail =
        typeof raw.payment_rail === 'string' ? raw.payment_rail : null;
      const region = classifyBridgeRegion(row.currency, paymentRail);
      const attributeAt = region === 'eur' ? row.noticeCreatedAt : row.depositCreatedAt;
      if (!inRange(attributeAt)) continue;

      const bucket = region === 'eur' ? eur : region === 'us' ? us : other;
      bucket.fraudCount += 1;
      bucket.fraudVolumeUsd += parseAmount(row.amount);
    }

    // Distinct deposits per region for the month
    const seen = {
      us: new Set<string>(),
      eur: new Set<string>(),
      other: new Set<string>(),
    };

    for (const event of depositEvents) {
      if (!event.depositId) continue;
      const source = (event.source && typeof event.source === 'object'
        ? event.source
        : {}) as Record<string, unknown>;
      const paymentRail =
        typeof source.payment_rail === 'string'
          ? source.payment_rail
          : typeof source.rail === 'string'
            ? source.rail
            : null;
      const region = classifyBridgeRegion(event.currency, paymentRail);
      const bucket = region === 'eur' ? eur : region === 'us' ? us : other;
      const keySet = seen[region];
      if (keySet.has(event.depositId)) continue;
      keySet.add(event.depositId);
      bucket.depositCount += 1;
      bucket.depositVolumeUsd += parseAmount(event.amount);
    }

    const usF = finalizeBucket(us);
    const eurF = finalizeBucket(eur);
    const otherF = finalizeBucket(other);

    const combined = finalizeBucket({
      fraudCount: usF.fraudCount + eurF.fraudCount + otherF.fraudCount,
      fraudVolumeUsd: usF.fraudVolumeUsd + eurF.fraudVolumeUsd + otherF.fraudVolumeUsd,
      depositCount: usF.depositCount + eurF.depositCount + otherF.depositCount,
      depositVolumeUsd:
        usF.depositVolumeUsd + eurF.depositVolumeUsd + otherF.depositVolumeUsd,
      countRate: 0,
      volumeRate: 0,
      countRateBps: 0,
      volumeRateBps: 0,
      exceedsPenaltyBox: false,
      exceedsCritical: false,
    });

    const openFraudAlerts = await prisma.bridgeFundsRequest.count({
      where: {
        fraud: true,
        status: { in: ['open', 'return_initiated', 'failed'] },
      },
    });

    return {
      month: monthKey,
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      penaltyBoxThresholdBps: BRIDGE_FRAUD_PENALTY_BOX_BPS,
      criticalThresholdBps: BRIDGE_FRAUD_CRITICAL_BPS,
      us: usF,
      eur: eurF,
      other: otherF,
      combined,
      openFraudAlerts,
      inPenaltyBoxRisk:
        usF.exceedsPenaltyBox
        || eurF.exceedsPenaltyBox
        || combined.exceedsPenaltyBox,
      inCriticalRisk:
        usF.exceedsCritical || eurF.exceedsCritical || combined.exceedsCritical,
    };
  }
}
