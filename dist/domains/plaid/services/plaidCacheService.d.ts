/**
 * Plaid 快取服務
 * 協調快取、同步與財務快照相關操作
 */
/**
 * Phase 3 Zero-Access E2EE 加密形式快照
 *
 * 後端只回傳 metadata + ciphertext，前端用 privateKey unwrap payloadKeys 後解密 row payload。
 */
export interface EncryptedFinanceSnapshot {
    payloadKeys: Array<{
        id: string;
        scope: string;
        wrappedSek: string;
        algorithm: string;
    }>;
    accounts: Array<{
        accountId: string;
        plaidItemId: string | null;
        type: string;
        bucket: string;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
    transactions: Array<{
        transactionId: string;
        accountId: string;
        plaidItemId: string | null;
        date: string;
        month: string;
        isPending: boolean;
        isRecurring: boolean;
        isSubscription: boolean;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
    investmentAccounts: Array<{
        accountId: string;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
    investments: Array<{
        investmentId: string;
        accountId: string;
        type: string;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
    /**
     * Phase 3 partial-failure surface.
     *
     * When `partial` is `true`, at least one Plaid Item failed to refresh in
     * this request and `failedItemIds` lists the affected `PlaidItem.id`
     * values. The encrypted rows for the failing item(s) reflect their last
     * known state (or are absent if the item has never synced), so callers
     * MUST treat the snapshot as incomplete and decide whether to retry, hide
     * stale items, or surface a warning to the user.
     *
     * When `partial` is `false`, all items succeeded (or there were no items).
     */
    partial: boolean;
    failedItemIds: string[];
}
export declare class PlaidCacheService {
    /**
     * 取得「加密形式」財務快照（優化版－支持快取）。
     *
     * Phase 3 Zero-Access E2EE only：
     *   - 快取未過期 → 直接從 cache 撈加密 row（後端不解密）
     *   - 快取過期或 isManualRefresh → 從 Plaid API 抓明文 → 加密寫 cache → 從 cache 撈加密 row 回傳
     *
     * 後端在第二條路徑中**只在記憶體**短暫持有明文，立即 SEK 加密寫 DB 後 zeroize SEK。
     */
    static getFinanceSnapshotOptimized(userId: string, isManualRefresh?: boolean): Promise<EncryptedFinanceSnapshot>;
    /**
     * 從緩存取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
     *
     * 與 `getSnapshotFromCache` 不同：
     *   - 後端不解密任何 payload，只 select metadata + payloadCiphertext + payloadKeyId
     *   - 額外回傳 payloadKeys（去重後的 wrappedSek 清單）
     *
     * 前端流程：
     *   1. 用 privateKey 對每個 payloadKey 做 sealed-box-open → 拿到 SEK
     *   2. 對每個 row 用對應 SEK 解 payloadCiphertext → 拿到 sensitive payload
     *   3. 與 metadata 合併 → 渲染
     *
     * 沒有 payloadCiphertext 的 row（PR 2 之前未 setup keypair 時寫入的）會被跳過。
     */
    static getEncryptedSnapshotFromCache(userId: string): Promise<EncryptedFinanceSnapshot>;
    /**
     * 從 Plaid API 取得明文增量快照（內部用）。
     *
     * 此回傳值僅在 `saveFinanceSnapshotToCache` 內被加密寫入 DB；caller 不應外洩到 controller。
     * transactionsSync 為增量 API，回傳是「上次 cursor 之後新增/修改的 transactions」。
     * 既有 transactions 保留在 DB 加密表內，**不在此回傳值中**——caller 不需要 merge。
     *
     * `failedItemIds` records `PlaidItem.id` values whose per-item fetch threw.
     * Callers can surface this so the front-end knows the snapshot is partial.
     */
    private static fetchPlaintextFromPlaid;
    /**
     * 將明文財務快照加密寫入快取（Phase 3 Zero-Access E2EE only）。
     *
     * 流程：
     *   1. 必須能取得使用者的 publicKey；否則拋 KeyPairNotConfiguredError
     *      （PR 5 已移除 legacy 寫入路徑，使用者必須先 setup keypair）
     *   2. 為這次 sync 建立 4 把 SEK（accounts / transactions / investmentAccounts / investments）
     *   3. 每個 row 把 sensitive 欄位整包 AES-256-GCM 加密成 payloadCiphertext
     *   4. 同步寫 cashFlow + plaidInvestment 加密 AssetSnapshot（趁明文還在記憶體）
     *   5. finally 立即 zeroize 所有 SEK
     */
    private static saveFinanceSnapshotToCache;
}
//# sourceMappingURL=plaidCacheService.d.ts.map