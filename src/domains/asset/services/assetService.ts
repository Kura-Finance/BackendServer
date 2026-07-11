import { prisma } from '../../shared/lib/prisma';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
} from '../../shared/services/payloadKeyService';
import { appLogger, logDebug, logError } from '../../logger';

/**
 * 資產服務 - 資產追蹤業務邏輯（Phase 3 Zero-Access E2EE only）
 *
 * 自 PR 5 起：
 *   - 移除舊版 `getAssetHistory` / `recordCompositeSnapshot` /
 *     `computeCurrentBreakdownFromSources`（依賴明文 cache row 與
 *     `AssetPerformance` 表，與 zero-access 模型互斥）
 *   - 僅保留 per-metric 加密快照寫入 & 加密讀取 API
 *   - `getRecordDates` 仍以 metadata 形式回傳（`AssetSnapshot.recordedAt`）
 */

// Phase 3 metric naming:
//   - 單來源 base：    "cashFlow"、"plaidInvestment"
//   - 多來源 sub-scoped："{base}:{source}:{id}"
//                       e.g. "cryptoSpot:exchange:acct-123"、
//                            "cryptoSpot:debank:0xabc..."、
//                            "defiProtocol:debank:0xabc..."
//     前端讀取後按 base 加總、按 sub-scoped key 取 latest 來組日線。
export type AssetMetricBase = 'cashFlow' | 'plaidInvestment' | 'cryptoSpot' | 'defiProtocol';
export type AssetMetricKey = string;

/**
 * `Record<metric, value>` — metric 字串可為 base 或 sub-scoped 形式。
 * 為了向後相容仍允許 4 個 base metric 為 optional 欄位。
 */
export interface PlaintextMetrics {
  cashFlow?: number;
  plaidInvestment?: number;
  cryptoSpot?: number;
  defiProtocol?: number;
  // 任意 sub-scoped metric（"cryptoSpot:exchange:acct-id" 等）
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
   * 取得用戶所有 snapshot 的 recordedAt（去重排序，metadata only）。
   * 不解密 payload，純粹給前端做日期選擇器。
   */
  static async getRecordDates(userId: string): Promise<Date[]> {
    const snapshots = await prisma.assetSnapshot.findMany({
      where: { userId },
      distinct: ['recordedAt'],
      select: { recordedAt: true },
      orderBy: { recordedAt: 'desc' },
    });
    return snapshots.map((s) => s.recordedAt);
  }

  // ═════════════════════════════════════════════════════════════════
  // Phase 3 Zero-Access E2EE — per-metric 加密快照
  // ═════════════════════════════════════════════════════════════════

  /**
   * 把已知明文的 metric 寫成加密 AssetSnapshot row（每個 metric 一個 row）。
   *
   * 設計理念：呼叫者通常是某個 sync 流程（PlaidCacheService / ExchangeService /
   * DeBankService），它在 sync 過程中**還持有明文**，把要寫的 metric 直接傳進來。
   * 後端就在這唯一短暫持有明文的瞬間做加密，立刻 zeroize SEK，永久失去解密能力。
   *
   * 使用範例（PlaidCacheService 內）：
   *   await AssetService.recordSnapshotFromPlaintext(userId, {
   *     cashFlow: bankingValue,           // 從 snapshot.accounts 算出
   *     plaidInvestment: plaidInvValue,   // 從 snapshot.investments 算出
   *   });
   *
   * 若使用者尚未 setup keypair：graceful degrade，記 warning 後直接 return。
   * 由於 PR 5 已移除 legacy snapshot 寫入路徑，此情況下不會有資產歷史資料；
   * 必須先呼叫 `POST /api/auth/keys/setup`。
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
   * 用「Plaid snapshot」直接算出 cashFlow + plaidInvestment 兩個 metric 的明文。
   *
   * 給 PlaidCacheService.saveFinanceSnapshotToCache 在 SEK 還在記憶體時呼叫。
   * 不讀任何快取，純函式。
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
   * 取得某段時間內的加密 AssetSnapshot rows + 對應的 wrappedSek。
   *
   * 後端不解密，前端用 privateKey unwrap 後在客戶端組成 4-metric 時間序列。
   *
   * 前端聚合規則：
   *   - metric 字串：可能是 base("cashFlow") 或 sub-scoped("cryptoSpot:exchange:acct-123")
   *   - 同 sub-scoped key 在同一天若有多筆 row，取 recordedAt 最大者（去掉重複 sync）
   *   - 同 base、不同 sub-scope 的值要加總（cryptoSpot 跨 exchange + debank、defiProtocol 跨地址）
   */
  static async getEncryptedAssetHistory(
    userId: string,
    days: number = 30,
  ): Promise<EncryptedAssetHistoryResponse> {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);
    startDate.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.assetSnapshot.findMany({
      where: {
        userId,
        recordedAt: { gte: startDate },
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
