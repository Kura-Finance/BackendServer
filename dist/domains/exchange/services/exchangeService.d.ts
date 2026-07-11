/**
 * 交易所服務 - CCXT 整合層
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
        icon: string;
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
            logo: string;
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
            logo: string;
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
     * 從緩存中獲取交易所餘額和資產
     * 用於達到 API 限制時返回最後一次成功同步的數據
     */
    static getBalancesAndAssetsFromCache(userId: string, exchangeAccountId: string): Promise<{
        account: {
            id: string;
            exchange: string;
            displayName: string;
            icon: string;
        };
        balances: {
            symbol: string;
            logo: string;
            free: number;
            used: number;
            total: number;
            usdPrice: number;
            change24h: number;
            usdValue: number;
        }[];
        balancesUsdTotal: number;
        assets: {
            symbol: string;
            logo: string;
            free: number;
            used: number;
            total: number;
            usdPrice: number;
            change24h: number;
            usdValue: number;
        }[];
        assetsUsdTotal: number;
        positions: never[];
        positionsUsdTotal: number;
        totalUsdValue: number;
        timestamp: string;
        fromCache: boolean;
        cacheNotice: string;
    }>;
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