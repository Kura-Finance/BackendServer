/**
 * 統一的代號與交易所工具
 * 合併交易所常數、交易所型別、股票 Logo 與機構 Logo 的共用工具
 */
export interface SupportedExchange {
    id: string;
    displayName: string;
    requiresPassphrase: boolean;
    icon: string;
    website?: string;
}
export declare const KURA_SUPPORTED_EXCHANGES: SupportedExchange[];
export declare const EXCHANGE_DISPLAY_MAP: {
    [key: string]: string;
};
export declare const EXCHANGE_ICON_MAP: {
    [key: string]: string;
};
export declare const EXCHANGES_REQUIRING_PASSPHRASE: string[];
/**
 * 根據交易所 ID 獲取交易所圖標 URL
 * @param exchangeId 交易所 ID（例如：'binance', 'okx'）
 * @returns icon URL
 */
export declare function getExchangeIcon(exchangeId: string): string;
/**
 * 根據 symbol 取得股票 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * 加密貨幣使用：https://img.logo.dev/crypto/{SYMBOL}?token=
 * 股票優先使用 domain 推導，備選 ticker：https://img.logo.dev/ticker/{SYMBOL}?token=
 * @param symbol 股票代碼（例如：'AAPL', 'PLTR', 'BTC', 'CANYX', 'USDC.B', 'CUR:USD'）
 * @returns logo URL 或 fallback URL
 */
export declare function getStockLogoUrl(symbol: string): string;
/**
 * 根據投資機構名稱取得機構 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param institutionName 機構名稱（例如：'Fidelity', 'Interactive Brokers - Rick'）
 * @returns logo URL
 */
export declare function getInstitutionLogoUrl(institutionName: string): string;
/**
 * 根據商家名稱獲取商家 logo URL
 * 使用 Logo.dev API (https://logo.dev/) - 與機構 logo 保持一致
 * @param merchantName 商家名稱（例如：'Netflix', 'Amazon', 'Spotify', 'Netflix Inc.'）
 * @returns logo URL
 */
export declare function getMerchantLogoUrl(merchantName: string): string;
/**
 * 建立 Logo.dev URL
 * @param identifier domain、symbol 或其他識別符
 * @param type 類型：'domain'、'ticker' 或 'crypto'
 * @returns logo URL
 */
export declare function buildLogoDevUrl(identifier: string, type?: 'domain' | 'ticker' | 'crypto'): string;
/**
 * 新增股票 symbol 與公司 domain 映射
 * @param symbol 股票代碼
 * @param domain 公司 domain
 */
export declare function addStockDomainMapping(symbol: string, domain: string): void;
/**
 * 批次新增映射
 * @param mappings symbol -> domain 的映射物件
 */
export declare function addStockDomainMappings(mappings: Record<string, string>): void;
//# sourceMappingURL=symbolsAndExchangesUtil.d.ts.map