/**
 * Asset service — asset tracking business logic (Phase 3 Zero-Access E2EE only).
 *
 * Since PR 5:
 *   - Removed legacy `getAssetHistory` / `recordCompositeSnapshot` /
 *     `computeCurrentBreakdownFromSources` (depended on plaintext cache rows and
 *     `AssetPerformance`, incompatible with zero-access)
 *   - Keeps per-metric encrypted snapshot write & encrypted read APIs
 *   - `getRecordDates` returns metadata only (`AssetSnapshot.recordedAt`)
 */
import { prisma } from '../../shared/lib/prisma';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
} from '../../shared/services/payloadKeyService';
import { appLogger, logDebug, logError } from '../../logger';
import { DemoService } from '../../demo/demoService';
import { clampAssetHistoryDays, getUserTier } from '../../shared/lib/apiRateLimitUtil';

// Phase 3 metric naming:
//   - Single-source base: "cashFlow", "plaidInvestment"
//   - Multi-source sub-scoped: "{base}:{source}:{id}"
//       e.g. "cryptoSpot:exchange:acct-123",
//            "cryptoSpot:debank:0xabc...",
//            "defiProtocol:debank:0xabc..."
//     Client sums by base and takes latest per sub-scoped key for daily series.
export type AssetMetricBase = 'cashFlow' | 'plaidInvestment' | 'cryptoSpot' | 'defiProtocol';
export type AssetMetricKey = string;

/** Metrics included in GET /api/assets/history — net-worth curve only. */
export function isAssetHistoryMetric(metric: string): boolean {
  return metric === 'plaidInvestment' || metric === 'cryptoSpot' || metric.startsWith('cryptoSpot:');
}

const assetHistoryMetricWhere = {
  OR: [
    { metric: 'plaidInvestment' },
    { metric: 'cryptoSpot' },
    { metric: { startsWith: 'cryptoSpot:' } },
  ],
};

/**
 * `Record<metric, value>` — metric may be base or sub-scoped.
 * Four base metrics remain optional fields for backward compatibility.
 */
export interface PlaintextMetrics {
  cashFlow?: number;
  plaidInvestment?: number;
  cryptoSpot?: number;
  defiProtocol?: number;
  // Any sub-scoped metric (e.g. "cryptoSpot:exchange:acct-id")
  [extendedMetric: string]: number | undefined;
}

export interface EncryptedAssetSnapshotRow {
  id: string;
  metric: AssetMetricKey;
  recordedAt: Date;
  payloadCiphertext: string;
  payloadKeyId: string;
}

export interface EncryptedAssetHistoryResponse {
  userId: string;
  payloadKeys: Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>;
  snapshots: EncryptedAssetSnapshotRow[];
}

export class AssetService {
  /**
   * Distinct recordedAt values for the user's snapshots (sorted, metadata only).
   * No payload decryption — used by the date picker.
   */
  static async getRecordDates(userId: string): Promise<Date[]> {
    if (await DemoService.isDemoUser(userId)) {
      const history = await DemoService.assetHistory(userId, 30);
      const seen = new Set<number>();
      const dates: Date[] = [];
      for (const s of history.snapshots) {
        const t = s.recordedAt.getTime();
        if (!seen.has(t)) {
          seen.add(t);
          dates.push(s.recordedAt);
        }
      }
      return dates.sort((a, b) => b.getTime() - a.getTime());
    }
    const snapshots = await prisma.assetSnapshot.findMany({
      where: { userId, ...assetHistoryMetricWhere },
      distinct: ['recordedAt'],
      select: { recordedAt: true },
      orderBy: { recordedAt: 'desc' },
    });
    return snapshots.map((s) => s.recordedAt);
  }

  // ═════════════════════════════════════════════════════════════════
  // Phase 3 Zero-Access E2EE — per-metric encrypted snapshots
  // ═════════════════════════════════════════════════════════════════

  /**
   * Encrypt known plaintext metrics into AssetSnapshot rows (one row per metric).
   *
   * Callers are typically sync flows (PlaidCacheService / ExchangeService /
   * DeBankService) that still hold plaintext. Encrypt in that brief window,
   * then zeroize the SEK so the server permanently loses decrypt ability.
   *
   * Example (inside PlaidCacheService):
   *   await AssetService.recordSnapshotFromPlaintext(userId, {
   *     cashFlow: bankingValue,           // from snapshot.accounts
   *     plaidInvestment: plaidInvValue,   // from snapshot.investments
   *   });
   *
   * If the user has no keypair yet: soft degrade (warn + return).
   * PR 5 removed legacy snapshot writes, so history stays empty until
   * `POST /api/auth/keys/setup`.
   */
  static async recordSnapshotFromPlaintext(
    userId: string,
    metrics: PlaintextMetrics,
    recordedAt: Date = new Date(),
  ): Promise<void> {
    const entries: Array<[AssetMetricKey, number]> = [];
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      entries.push([metric, value]);
    }

    if (entries.length === 0) {
      return;
    }

    let payloadKey;
    try {
      payloadKey = await PayloadKeyService.createForUser(
        userId,
        `asset_snapshot:${userId}:${recordedAt.getTime()}`,
      );
    } catch (error) {
      if (error instanceof KeyPairNotConfiguredError) {
        // Pre-Phase-3 users that haven't yet called /api/auth/keys/setup —
        // gracefully skip snapshot creation. The Plaid sync caller treats
        // missing keypair as a soft failure for asset history.
        appLogger.warn(
          'User has no E2EE key pair — skipping encrypted asset snapshot',
          { userId, metrics: entries.map(([k]) => k) },
        );
        return;
      }
      // Anything else (DB outage, constraint error, crypto fault) is a real
      // bug — surface it so the caller can decide whether to roll back the
      // surrounding sync rather than silently dropping asset history.
      logError('Failed to create payload key for asset snapshot', error, { userId });
      throw error;
    }

    try {
      const rows = entries.map(([metric, value]) => ({
        userId,
        metric,
        recordedAt,
        payloadCiphertext: encryptPayload(payloadKey.sek, { value }),
        payloadKeyId: payloadKey.payloadKeyId,
      }));

      await prisma.assetSnapshot.createMany({ data: rows });

      logDebug('Recorded encrypted asset snapshot', {
        userId,
        metrics: entries.map(([k]) => k),
        recordedAt,
      });
    } finally {
      zeroize(payloadKey.sek);
    }
  }

  /**
   * Derive cashFlow + plaidInvestment plaintext from a Plaid snapshot.
   * Pure function for PlaidCacheService while SEK is still in memory.
   */
  static computePlaidMetricsFromSnapshot(snapshot: {
    accounts: Array<{ balance: number; type: string }>;
    investments: Array<{ holdings: number; currentPrice: number }>;
  }): { cashFlow: number; plaidInvestment: number } {
    const cashFlow = snapshot.accounts.reduce((sum, account) => {
      const normalizedType = String(account.type || '').toLowerCase();
      const balance = Number(account.balance || 0);
      return sum + (normalizedType === 'credit' ? -Math.abs(balance) : balance);
    }, 0);

    const plaidInvestment = snapshot.investments.reduce((sum, inv) => {
      const holdings = Number(inv.holdings || 0);
      const price = Number(inv.currentPrice || 0);
      return sum + holdings * price;
    }, 0);

    return { cashFlow, plaidInvestment };
  }

  /**
   * Encrypted AssetSnapshot rows + wrappedSek for a time range.
   * Backend does not decrypt; client builds the 2-metric series.
   *
   * Returns plaidInvestment + cryptoSpot (incl. sub-scoped cryptoSpot:*);
   * excludes cashFlow / defiProtocol.
   *
   * Client aggregation:
   *   - metric may be base ("plaidInvestment") or sub-scoped ("cryptoSpot:exchange:acct-123")
   *   - same sub-scoped key, same day → keep latest recordedAt
   *   - same base, different sub-scopes → sum (cryptoSpot across exchange + debank)
   */
  static async getEncryptedAssetHistory(
    userId: string,
    days: number = 30,
  ): Promise<EncryptedAssetHistoryResponse> {
    const tier = await getUserTier(userId);
    const effectiveDays = clampAssetHistoryDays(days, tier);

    if (await DemoService.isDemoUser(userId)) {
      return DemoService.assetHistory(userId, effectiveDays);
    }
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - effectiveDays + 1);
    startDate.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.assetSnapshot.findMany({
      where: {
        userId,
        recordedAt: { gte: startDate },
        ...assetHistoryMetricWhere,
      },
      select: {
        id: true,
        metric: true,
        recordedAt: true,
        payloadCiphertext: true,
        payloadKeyId: true,
      },
      orderBy: { recordedAt: 'asc' },
    });

    const snapshots: EncryptedAssetSnapshotRow[] = rows.map((r) => ({
      id: r.id,
      metric: r.metric,
      recordedAt: r.recordedAt,
      payloadCiphertext: r.payloadCiphertext,
      payloadKeyId: r.payloadKeyId,
    }));

    const payloadKeyIds = Array.from(new Set(snapshots.map((s) => s.payloadKeyId)));
    const payloadKeys = await PayloadKeyService.getForRead(userId, payloadKeyIds);

    return {
      userId,
      payloadKeys,
      snapshots,
    };
  }
}
