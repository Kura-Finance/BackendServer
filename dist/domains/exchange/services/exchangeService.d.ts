/**
 * 交易所服務 - CCXT 整合層
 * 支持全球 100+ 加密貨幣交易所
 */
/**
 * Phase 3 Zero-Access E2EE：加密形式的交易所快照。
 *
 * 後端只回 metadata + payloadCiphertext + payloadKeyId；payloadKeys 由前端用
 * privateKey unwrap 出 SEK 後解每個 row 的 payloadCiphertext。
 */
export interface EncryptedExchangeSnapshot {
    account: {
        id: string;
        exchange: string;
        displayName: string;
    };
    payloadKeys: Array<{
        id: string;
        scope: string;
        wrappedSek: string;
        algorithm: string;
    }>;
    balances: Array<{
        symbol: string;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
    assets: Array<{
        symbol: string;
        cachedAt: Date;
        payloadCiphertext: string;
        payloadKeyId: string;
    }>;
}
export declare class ExchangeService {
    /**
     * 驗證交易所連接
     */
    static verifyExchangeConnection(exchange: string, apiKey: string, apiSecret: string, passphrase?: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * 連結新的交易所帳戶
     */
    static connectExchange(userId: string, exchange: string, apiKey: string, apiSecret: string, passphrase?: string): Promise<{
        icon: string;
        userId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        exchange: string;
        exchangeDisplayName: string;
        apiKey: string;
        apiSecret: string;
        passphrase: string | null;
        isActive: boolean;
        isVerified: boolean;
        lastVerifiedAt: Date | null;
        verificationError: string | null;
    }>;
    /**
     * 獲取交易所餘額
     */
    static getExchangeBalances(userId: string, exchangeAccountId: string): Promise<{
        account: {
            id: string;
            exchange: string;
            exchangeDisplayName: string;
        };
        balances: any;
    }>;
    /**
     * 同步交易所餘額 + 資產，並回傳「加密形式」snapshot（Phase 3 Zero-Access E2EE only）。
     *
     * 後端流程：
     *   1. CCXT fetchBalance → 暫時持有明文 balances
     *   2. 透過 CCXT 取得各 symbol 的 USD 價格（純算術，不持久化）
     *   3. cacheBalances / cacheAssets 把明文 SEK 加密寫入 cache + AssetSnapshot
     *   4. 立即 zeroize SEK，從加密 cache 撈出 row 回傳（前端解密渲染）
     *
     * 注意：期貨持倉（positions）目前未做 zero-access 加密儲存（只在同步當下回傳），
     * PR 5 後 positions 不再寫入持久層；若需 zero-access 期貨歷史，需另闢儲存表。
     */
    static getBalancesAndAssets(userId: string, exchangeAccountId: string): Promise<EncryptedExchangeSnapshot>;
    /**
     * 寫入交易所現貨持倉（Phase 3 Zero-Access E2EE only）。
     *
     * 1. 為這次 sync 建立一把 SEK（scope=`exchange_asset:{accountId}:{ts}`），
     *    沒 keypair 直接拋（caller 顯示「請先 setup keypair」）
     * 2. 對 {holdings, price, value, percentageOfTotal} 整包加密成 payloadCiphertext
     * 3. 同一把 SEK 加密 `cryptoSpot:exchange:{accountId}` AssetSnapshot
     * 4. finally 立即釋放 SEK
     */
    private static cacheAssets;
    /**
     * 獲取代幣 USD 價格和 24h 變化
     * 通過 CCXT 交易所獲取最新價格信息和 24h 漲幅
     */
    private static getPrices;
    /**
     * 快取餘額數據（Phase 3 Zero-Access E2EE only）。
     *
     * 取得 SEK（scope=`exchange_balance:{accountId}:{ts}`），對 {free,used,total} 整包加密。
     * 沒 keypair → 拋（caller 顯示「請先 setup keypair」）。
     */
    private static cacheBalances;
    /**
     * Phase 3 Zero-Access E2EE：取得交易所「加密形式」餘額 + 資產快照。
     *
     * - 後端只 select metadata + payloadCiphertext + payloadKeyId，不解密
     * - 額外回傳 payloadKeys（去重後的 wrappedSek 清單）
     * - 沒有 payloadCiphertext 的 legacy row 會被跳過
     */
    static getEncryptedBalancesAndAssets(userId: string, exchangeAccountId: string): Promise<EncryptedExchangeSnapshot>;
    /**
     * 獲取所有支持的交易所列表
     */
    static getSupportedExchanges(): import("..").SupportedExchange[];
    /**
     * 獲取交易所顯示名稱
     */
    private static getExchangeDisplayName;
    /**
     * 斷開交易所連接
     */
    static disconnectExchange(userId: string, exchangeAccountId: string): Promise<{
        success: boolean;
    }>;
    /**
     * 獲取用戶連接的所有交易所帳戶
     */
    static getUserExchangeAccounts(userId: string): Promise<{
        icon: string;
        id: string;
        createdAt: Date;
        exchange: string;
        exchangeDisplayName: string;
        isActive: boolean;
        isVerified: boolean;
        lastVerifiedAt: Date | null;
    }[]>;
}
//# sourceMappingURL=exchangeService.d.ts.map