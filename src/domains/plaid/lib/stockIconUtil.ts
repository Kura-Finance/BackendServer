/**
 * Stock Icon/Logo Utility
 * 根据股票symbol获取公司logo
 */

/**
 * 常见股票与公司domain映射
 */
const STOCK_TO_DOMAIN: Record<string, string> = {
  // 科技
  AAPL: 'apple.com',
  GOOGL: 'google.com',
  MSFT: 'microsoft.com',
  AMZN: 'amazon.com',
  TSLA: 'tesla.com',
  META: 'meta.com',
  NVDA: 'nvidia.com',
  AMD: 'amd.com',
  INTC: 'intel.com',
  IBM: 'ibm.com',
  
  // 金融
  JPM: 'jpmorganchase.com',
  BAC: 'bankofamerica.com',
  WFC: 'wellsfargo.com',
  GS: 'goldmansachs.com',
  
  // 消费
  MCD: 'mcdonalds.com',
  KO: 'coca-cola.com',
  PEP: 'pepsico.com',
  WMT: 'walmart.com',
  COST: 'costco.com',
  
  // 能源
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  
  // 医疗
  JNJ: 'jnj.com',
  UNH: 'unitedhealthgroup.com',
  PFE: 'pfizer.com',
  MRNA: 'modernatx.com',
};

const FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=plaid.com&sz=128';

/**
 * 根据symbol获取股票logo URL
 * 使用Google Favicon API + 本地映射
 * @param symbol 股票代码 (e.g., 'AAPL')
 * @returns logo URL
 */
export function getStockLogoUrl(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();
  
  // 首先检查本地映射
  const domain = STOCK_TO_DOMAIN[upperSymbol];
  if (domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }
  
  // 如果没有本地映射，使用fallback
  return FALLBACK_LOGO;
}

/**
 * 添加新的股票symbol与公司domain映射
 * @param symbol 股票代码
 * @param domain 公司domain
 */
export function addStockDomainMapping(symbol: string, domain: string): void {
  STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
}

/**
 * 批量添加映射
 * @param mappings symbol -> domain 的映射对象
 */
export function addStockDomainMappings(mappings: Record<string, string>): void {
  Object.entries(mappings).forEach(([symbol, domain]) => {
    STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
  });
}
