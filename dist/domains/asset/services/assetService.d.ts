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
export type AssetMetricBase = 'cashFlow' | 'plaidInvestment' | 'cryptoSpot' | 'defiProtocol';
export type AssetMetricKey = string;
/** Metrics included in GET /api/assets/history — net-worth curve only. */
export declare function isAssetHistoryMetric(metric: string): boolean;
/**
 * `Record<metric, value>` — metric 字串可為 base 或 sub-scoped 形式。
 * 為了向後相容仍允許 4 個 base metric 為 optional 欄位。
 */
export interface PlaintextMetrics {
    cashFlow?: number;
    plaidInvestment?: number;
    cryptoSpot?: number;
    defiProtocol?: number;
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
    payloadKeys: Array<{
        id: string;
        scope: string;
        wrappedSek: string;
        algorithm: string;
    }>;
    snapshots: EncryptedAssetSnapshotRow[];
}
export declare class AssetService {
    /**
     * 取得用戶所有 snapshot 的 recordedAt（去重排序，metadata only）。
     * 不解密 payload，純粹給前端做日期選擇器。
     */
    static getRecordDates(userId: string): Promise<Date[]>;
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
    static recordSnapshotFromPlaintext(userId: string, metrics: PlaintextMetrics, recordedAt?: Date): Promise<void>;
    /**
     * 用「Plaid snapshot」直接算出 cashFlow + plaidInvestment 兩個 metric 的明文。
     *
     * 給 PlaidCacheService.saveFinanceSnapshotToCache 在 SEK 還在記憶體時呼叫。
     * 不讀任何快取，純函式。
     */
    static computePlaidMetricsFromSnapshot(snapshot: {
        accounts: Array<{
            balance: number;
            type: string;
        }>;
        investments: Array<{
            holdings: number;
            currentPrice: number;
        }>;
    }): {
        cashFlow: number;
        plaidInvestment: number;
    };
    /**
     * 取得某段時間內的加密 AssetSnapshot rows + 對應的 wrappedSek。
     *
     * 後端不解密，前端用 privateKey unwrap 後在客戶端組成 2-metric 時間序列。
     *
     * 僅回傳 plaidInvestment + cryptoSpot（含 sub-scoped cryptoSpot:*）；不含 cashFlow / defiProtocol。
     *
     * 前端聚合規則：
     *   - metric 字串：可能是 base("plaidInvestment") 或 sub-scoped("cryptoSpot:exchange:acct-123")
     *   - 同 sub-scoped key 在同一天若有多筆 row，取 recordedAt 最大者（去掉重複 sync）
     *   - 同 base、不同 sub-scope 的值要加總（cryptoSpot 跨 exchange + debank）
     */
    static getEncryptedAssetHistory(userId: string, days?: number): Promise<EncryptedAssetHistoryResponse>;
}
//# sourceMappingURL=assetService.d.ts.map