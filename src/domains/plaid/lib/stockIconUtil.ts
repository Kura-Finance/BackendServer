/**
 * Stock Icon/Logo Utility
 * 使用 Logo.dev API 根据公司 domain 获取 logo
 * https://www.logo.dev/docs/introduction
 */

/**
 * 股票代码到公司 domain 的映射
 * 用于推断没有直接对应的股票代码
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
  PLTR: 'palantir.com',
  
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
  
  // ETF - iShares
  ISHUF: 'ishares.com',
  IVV: 'ishares.com',
  AGG: 'ishares.com',
  VTI: 'vanguard.com',
  VOO: 'vanguard.com',
  VEA: 'vanguard.com',
  VWO: 'vanguard.com',
  BND: 'vanguard.com',
  SPY: 'spdrs.com',
  QQQ: 'invesco.com',
  EEM: 'ishares.com',
  EFA: 'ishares.com',
  GLD: 'ishares.com',
  TLT: 'ishares.com',
  
  // 加密货币
  BTC: 'bitcoin.org',
  BITCOIN: 'bitcoin.org',
  ETH: 'ethereum.org',
  ETHEREUM: 'ethereum.org',
  XRP: 'ripple.com',
  RIPPLE: 'ripple.com',
  LTC: 'litecoin.org',
  LITECOIN: 'litecoin.org',
  BCH: 'bitcoincash.org',
  BITCOINCASH: 'bitcoincash.org',
  DOGE: 'dogecoin.com',
  DOGECOIN: 'dogecoin.com',
  ADA: 'cardano.org',
  CARDANO: 'cardano.org',
  LINK: 'chain.link',
  CHAINLINK: 'chain.link',
  SOL: 'solana.com',
  SOLANA: 'solana.com',
  DOT: 'polkadot.network',
  POLKADOT: 'polkadot.network',
  MATIC: 'polygon.technology',
  POLYGON: 'polygon.technology',
  AVAX: 'avax.network',
  AVALANCHE: 'avax.network',
  FTM: 'fantom.foundation',
  FANTOM: 'fantom.foundation',
  ARB: 'arbitrum.io',
  ARBITRUM: 'arbitrum.io',
  OP: 'optimism.io',
  OPTIMISM: 'optimism.io',
  USDC: 'circle.com',
  USDT: 'tether.to',
  BUSD: 'paxosglobal.com',
  DAI: 'makerdao.com',
};

/**
 * 投资/证券经纪机构名称到 domain 的映射
 */
const INSTITUTION_TO_DOMAIN: Record<string, string> = {
  // 美国主要经纪商
  'Fidelity': 'fidelity.com',
  'Vanguard': 'vanguard.com',
  'Charles Schwab': 'schwab.com',
  'Schwab': 'schwab.com',
  'E*TRADE': 'etrade.com',
  'Interactive Brokers': 'interactivebrokers.com',
  'TD Ameritrade': 'tdameritrade.com',
  'Robinhood': 'robinhood.com',
  'Coinbase': 'coinbase.com',
  'Kraken': 'kraken.com',
  'Gemini': 'gemini.com',
  'Webull': 'webull.com',
  'Public': 'public.com',
  
  // JP Morgan & Chase
  'JPMorgan Chase': 'jpmorganchase.com',
  'JPMC': 'jpmorganchase.com',
  'JP Morgan': 'jpmorganchase.com',
  'Chase': 'chase.com',
  
  // Bank of America
  'Bank of America': 'bankofamerica.com',
  'Merrill Lynch': 'merrilledge.com',
  
  // 其他金融机构
  'Wells Fargo': 'wellsfargo.com',
  'Goldman Sachs': 'goldmansachs.com',
  'Ally': 'ally.com',
  'eTrade': 'etrade.com',
  'Tastyworks': 'tastyworks.com',
};


const FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';

/**
 * Logo.dev API token (从环境变量读取)
 * 如果未设置，则使用 Logo.dev 的公开 endpoint (无需认证)
 */
const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN;
const LOGO_DEV_USE_TOKEN = !!LOGO_DEV_TOKEN;

/**
 * 检查是否为货币符号或不支持的资产类型
 * @param symbol 资产代码
 * @returns 如果是货币则返回 true
 */
function isCurrencyOrUnsupported(symbol: string): boolean {
  if (!symbol) return true;
  
  const upper = symbol.toUpperCase();
  
  // 包含冒号通常是货币对格式 (CUR:USD, USD:JPY 等) - IBKR格式
  if (symbol.includes(':')) return true;
  
  // 检查是否为常见货币代码 (3个大写字母)
  const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK'];
  if (upper.length === 3 && commonCurrencies.includes(upper)) return true;
  
  // 检查包含space的货币表示法 ("U S DOLLAR" - Charles Schwab格式)
  if (symbol.includes(' ')) {
    const normalizedSpace = symbol.toLowerCase().replace(/\s+/g, '');
    if (normalizedSpace.includes('dollar') || normalizedSpace.includes('euro') || 
        normalizedSpace.includes('pound') || normalizedSpace.includes('yen')) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查是否为复杂的金融工具代码（债券、基金等）
 * 例如：NHX105509（债券代码）、ZN（Chicago Board of Trade 代码）
 * @param symbol symbol
 * @returns 如果是复杂代码则返回 true
 */
function isComplexFinancialCode(symbol: string): boolean {
  if (!symbol) return false;
  
  const cleanSymbol = symbol.toUpperCase();
  
  // 检查是否为混合字母数字的长代码（超过 8 个字符，包含数字）
  if (cleanSymbol.length > 8 && /[0-9]/.test(cleanSymbol) && /[A-Z]/.test(cleanSymbol)) {
    return true;
  }
  
  // 检查是否为期货代码格式（如 ZN=F, GC=F 等）
  if (cleanSymbol.includes('=')) {
    return true;
  }
  
  return false;
}

/**
 * 推断股票企业的 domain
 * @param symbol 股票代码 (e.g., 'AAPL', 'PLTR', 'BTC', 'NHX105509')
 * @returns domain URL (e.g., 'apple.com') 或 null 如果无法推断
 */
function inferDomainFromSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // 检查是否为货币或不支持的资产类型
  if (isCurrencyOrUnsupported(symbol)) {
    return null;
  }
  
  // 检查是否为复杂的金融工具代码（债券、基金等）
  // 这些代码通常无法推断 domain，返回 null 使用 fallback
  if (isComplexFinancialCode(symbol)) {
    return null;
  }
  
  // 清理symbol: 移除特殊字符，只保留字母和数字
  let cleanSymbol = symbol
    .toUpperCase()
    .replace(/[:\s\-]/g, '') // 移除冒号、空格、连字符
    .replace(/[^A-Z0-9]/g, ''); // 移除其他特殊字符
  
  // 首先检查映射表（优先查找，包含股票和加密货币）
  if (STOCK_TO_DOMAIN[cleanSymbol]) {
    return STOCK_TO_DOMAIN[cleanSymbol];
  }
  
  // 对于未知 symbol，尝试推导
  // 大多数公司 domain 是小写 symbol + .com
  if (cleanSymbol.length > 0 && cleanSymbol.length <= 6) { // 合理的symbol长度
    return `${cleanSymbol.toLowerCase()}.com`;
  }
  
  return null;
}

/**
 * 根据 symbol 获取股票 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param symbol 股票代码 (e.g., 'AAPL', 'PLTR', 'CUR:USD')
 * @returns logo URL 或 fallback URL
 */
export function getStockLogoUrl(symbol: string): string {
  if (!symbol) {
    return FALLBACK_LOGO;
  }
  
  const domain = inferDomainFromSymbol(symbol);
  if (!domain) {
    return FALLBACK_LOGO; // 无法推断domain则使用fallback
  }
  
  return buildLogoDevUrl(domain);
}

/**
 * 根据投资机构名称获取机构 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param institutionName 机构名称 (e.g., 'Fidelity', 'Interactive Brokers - Rick')
 * @returns logo URL
 */
export function getInstitutionLogoUrl(institutionName: string): string {
  if (!institutionName) {
    return FALLBACK_LOGO;
  }
  
  // 清理机构名称: 移除用户特定的后缀 (如 " - Rick", " (Rick)")
  let cleanInstitutionName = institutionName
    .replace(/\s*[\-–—]\s*[A-Za-z0-9]+\s*$/, '') // 移除 " - Username" 格式
    .replace(/\s*\([A-Za-z0-9]+\)\s*$/, '') // 移除 " (Username)" 格式
    .trim();
  
  // 检查清理后的机构映射表
  const domain = INSTITUTION_TO_DOMAIN[cleanInstitutionName] || 
                 INSTITUTION_TO_DOMAIN[institutionName] || 
                 inferDomainFromInstitution(cleanInstitutionName);
  
  return buildLogoDevUrl(domain);
}

/**
 * 推断投资机构的 domain
 * @param institutionName 机构名称
 * @returns domain URL
 */
function inferDomainFromInstitution(institutionName: string): string {
  // 移除常见的后缀和前缀
  let cleanName = institutionName
    .toLowerCase()
    .replace(/\s+/g, '') // 移除空格
    .replace(/[&]/g, '') // 移除 &
    .replace(/[\-–—]/g, '') // 移除连字符
    .replace(/[\*]/g, '') // 移除特殊字符
    .replace(/[()]/g, ''); // 移除括号
  
  return `${cleanName}.com`;
}

/**
 * 构建 Logo.dev URL
 * @param domain 公司 domain
 * @returns logo URL
 */
function buildLogoDevUrl(domain: string): string {
  if (!domain) {
    return FALLBACK_LOGO;
  }
  
  let logoUrl = `https://img.logo.dev/${domain}?format=webp&size=128`;
  
  if (LOGO_DEV_USE_TOKEN) {
    logoUrl += `&token=${LOGO_DEV_TOKEN}`;
  }
  
  return logoUrl;
}


/**
 * 添加新的股票 symbol 与公司 domain 映射
 * @param symbol 股票代码
 * @param domain 公司 domain
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
