/**
 * Stock Icon/Logo Utility
 * 使用 Logo.dev API 根据公司 domain 获取 logo
 * https://www.logo.dev/docs/introduction
 */
/**
 * 根据 symbol 获取股票 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param symbol 股票代码 (e.g., 'AAPL', 'PLTR', 'CUR:USD')
 * @returns logo URL 或 fallback URL
 */
export declare function getStockLogoUrl(symbol: string): string;
/**
 * 根据投资机构名称获取机构 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param institutionName 机构名称 (e.g., 'Fidelity', 'Interactive Brokers - Rick')
 * @returns logo URL
 */
export declare function getInstitutionLogoUrl(institutionName: string): string;
/**
 * 添加新的股票 symbol 与公司 domain 映射
 * @param symbol 股票代码
 * @param domain 公司 domain
 */
export declare function addStockDomainMapping(symbol: string, domain: string): void;
/**
 * 批量添加映射
 * @param mappings symbol -> domain 的映射对象
 */
export declare function addStockDomainMappings(mappings: Record<string, string>): void;
//# sourceMappingURL=stockIconUtil.d.ts.map