/**
 * Exchange Service - CCXT Integration Layer
 * 支持全球 100+ 加密貨幣交易所
 */
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
        apiKey: string;
        userId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        exchange: string;
        exchangeDisplayName: string;
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
     * 合併獲取交易所餘額和資產 (現貨持倉)
     * 返回簡化的 JSON 結構，便於前端使用和未來擴展
     */
    static getBalancesAndAssets(userId: string, exchangeAccountId: string): Promise<{
        account: {
            id: string;
            exchange: string;
            displayName: string;
        };
        balances: {
            usdPrice: number;
            change24h: number;
            usdValue: number;
            symbol: string;
            free: number;
            used: number;
            total: number;
        }[];
        balancesUsdTotal: number;
        assets: {
            usdPrice: number;
            change24h: number;
            usdValue: number;
            symbol: string;
            free: number;
            used: number;
            total: number;
        }[];
        assetsUsdTotal: number;
        positions: any;
        positionsUsdTotal: any;
        totalUsdValue: any;
        timestamp: string;
    }>;
    /**
     * 獲取代幣 USD 價格和 24h 變化
     * 通過 CCXT 交易所獲取最新價格信息和 24h 漲幅
     */
    private static getPrices;
    /**
     * 獲取期貨合約持倉
     * 支持 CCXT 交易所的合約持倉數據
     */
    private static getPositions;
    /**
     * 快取餘額數據
     */
    private static cacheBalances;
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