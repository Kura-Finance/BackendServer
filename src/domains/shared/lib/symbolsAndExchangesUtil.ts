/**
 * 統一的代號與交易所工具
 * 合併交易所常數、交易所型別、股票 Logo 與機構 Logo 的共用工具
 */

// ============================================
// 交易所相關常數與型別（來自 constants.ts）
// ============================================

export interface SupportedExchange {
  id: string;
  displayName: string;
  requiresPassphrase: boolean;
  icon: string; // 交易所圖示 URL
  website?: string; // 官方網站
}

export const KURA_SUPPORTED_EXCHANGES: SupportedExchange[] = [
  {
    id: 'binance',
    displayName: 'Binance',
    requiresPassphrase: false,
    icon: 'https://img.logo.dev/binance.com?format=webp&size=128',
    website: 'https://www.binance.com',
  },
  {
    id: 'okx',
    displayName: 'OKX',
    requiresPassphrase: true,
    icon: 'https://img.logo.dev/okx.com?format=webp&size=128',
    website: 'https://www.okx.com',
  },
  {
    id: 'bybit',
    displayName: 'Bybit',
    requiresPassphrase: false,
    icon: 'https://img.logo.dev/bybit.com?format=webp&size=128',
    website: 'https://www.bybit.com',
  },
  {
    id: 'coinbase',
    displayName: 'Coinbase',
    requiresPassphrase: false,
    icon: 'https://img.logo.dev/coinbase.com?format=webp&size=128',
    website: 'https://www.coinbase.com',
  },
  {
    id: 'kraken',
    displayName: 'Kraken',
    requiresPassphrase: false,
    icon: 'https://img.logo.dev/kraken.com?format=webp&size=128',
    website: 'https://www.kraken.com',
  },
  {
    id: 'kucoin',
    displayName: 'KuCoin',
    requiresPassphrase: true,
    icon: 'https://img.logo.dev/kucoin.com?format=webp&size=128',
    website: 'https://www.kucoin.com',
  },
  {
    id: 'bitget',
    displayName: 'Bitget',
    requiresPassphrase: true,
    icon: 'https://img.logo.dev/bitget.com?format=webp&size=128',
    website: 'https://www.bitget.com',
  },
  {
    id: 'gateio',
    displayName: 'Gate.io',
    requiresPassphrase: false,
    icon: 'https://img.logo.dev/gate.io?format=webp&size=128',
    website: 'https://www.gate.io',
  },
];

// 快速查找地圖
export const EXCHANGE_DISPLAY_MAP: { [key: string]: string } = KURA_SUPPORTED_EXCHANGES.reduce(
  (acc, exchange) => {
    acc[exchange.id] = exchange.displayName;
    return acc;
  },
  {} as { [key: string]: string }
);

// 交易所圖示查找地圖
export const EXCHANGE_ICON_MAP: { [key: string]: string } = KURA_SUPPORTED_EXCHANGES.reduce(
  (acc, exchange) => {
    acc[exchange.id] = exchange.icon;
    return acc;
  },
  {} as { [key: string]: string }
);

// 需要密語的交易所列表
export const EXCHANGES_REQUIRING_PASSPHRASE = KURA_SUPPORTED_EXCHANGES.filter(
  (ex) => ex.requiresPassphrase
).map((ex) => ex.id);

const FALLBACK_LOGO = 'https://img.logo.dev/kura-finance.com?format=webp&size=128';

/**
 * Logo.dev API token（從環境變數讀取）
 * 若未設定，則使用 Logo.dev 的公開 endpoint（無需認證）
 */
const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN;
const LOGO_DEV_USE_TOKEN = !!LOGO_DEV_TOKEN;

/**
 * 根據交易所 ID 獲取交易所圖標 URL
 * @param exchangeId 交易所 ID（例如：'binance', 'okx'）
 * @returns icon URL
 */
export function getExchangeIcon(exchangeId: string): string {
  const iconUrl = EXCHANGE_ICON_MAP[exchangeId.toLowerCase()];
  if (!iconUrl) {
    return FALLBACK_LOGO;
  }
  
  // 如果設置了 Logo.dev Token，加入到 URL
  if (LOGO_DEV_USE_TOKEN) {
    const separator = iconUrl.includes('?') ? '&' : '?';
    return `${iconUrl}${separator}token=${LOGO_DEV_TOKEN}`;
  }
  
  return iconUrl;
}

// ============================================
// 股票與機構 Logo 工具（來自 stockIconUtil.ts）
// ============================================

/**
 * 股票代碼到公司 domain 的映射
 * 用於推導沒有直接對應的股票代碼
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
  
  // 消費
  MCD: 'mcdonalds.com',
  KO: 'coca-cola.com',
  PEP: 'pepsico.com',
  WMT: 'walmart.com',
  COST: 'costco.com',
  
  // 能源
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  
  // 醫療
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
  
  // 加密貨幣
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

// 加密貨幣符號集合（用於識別是否使用 crypto API）
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'BITCOIN',
  'ETH', 'ETHEREUM',
  'XRP', 'RIPPLE',
  'LTC', 'LITECOIN',
  'BCH', 'BITCOINCASH',
  'DOGE', 'DOGECOIN',
  'ADA', 'CARDANO',
  'LINK', 'CHAINLINK',
  'SOL', 'SOLANA',
  'DOT', 'POLKADOT',
  'MATIC', 'POLYGON',
  'AVAX', 'AVALANCHE',
  'FTM', 'FANTOM',
  'ARB', 'ARBITRUM',
  'OP', 'OPTIMISM',
  'USDC',
  'USDT',
  'BUSD',
  'DAI',
]);

/**
 * 投資/證券經紀機構名稱到 domain 的映射
 */
const INSTITUTION_TO_DOMAIN: Record<string, string> = {
  // 美國主要經紀商
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
  
  // 其他金融機構
  'Wells Fargo': 'wellsfargo.com',
  'Goldman Sachs': 'goldmansachs.com',
  'Ally': 'ally.com',
  'eTrade': 'etrade.com',
  'Tastyworks': 'tastyworks.com',
};

/**
 * 檢查是否為貨幣符號或不支援的資產類型
 * @param symbol 資產代碼
 * @returns 若為貨幣則回傳 true
 */
function isCurrencyOrUnsupported(symbol: string): boolean {
  if (!symbol) return true;
  
  const upper = symbol.toUpperCase();
  
  // 包含冒號通常是貨幣對格式（CUR:USD、USD:JPY 等）- IBKR 格式
  if (symbol.includes(':')) return true;
  
  // 檢查是否為常見貨幣代碼（3 個大寫字母）
  const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK'];
  if (upper.length === 3 && commonCurrencies.includes(upper)) return true;
  
  // 檢查包含空白的貨幣表示法（"U S DOLLAR" - Charles Schwab 格式）
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
 * 檢查是否為複雜金融工具代碼（債券、基金等）
 * 例如：NHX105509（債券代碼）、ZN（Chicago Board of Trade 代碼）
 * @param symbol symbol
 * @returns 若為複雜代碼則回傳 true
 */
function isComplexFinancialCode(symbol: string): boolean {
  if (!symbol) return false;
  
  const cleanSymbol = symbol.toUpperCase();
  
  // 檢查是否為英數混合長代碼（超過 8 個字元且包含數字）
  if (cleanSymbol.length > 8 && /[0-9]/.test(cleanSymbol) && /[A-Z]/.test(cleanSymbol)) {
    return true;
  }
  
  // 檢查是否為期貨代碼格式（如 ZN=F、GC=F 等）
  if (cleanSymbol.includes('=')) {
    return true;
  }
  
  return false;
}

/**
 * 推導股票公司的 domain
 * @param symbol 股票代碼（例如：'AAPL', 'PLTR', 'BTC', 'NHX105509'）
 * @returns domain URL（例如：'apple.com'），若無法推導則回傳 null
 */
function inferDomainFromSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // 檢查是否為貨幣或不支援的資產類型
  if (isCurrencyOrUnsupported(symbol)) {
    return null;
  }
  
  // 檢查是否為複雜金融工具代碼（債券、基金等）
  // 這些代碼通常無法推導 domain，回傳 null 交由 fallback
  if (isComplexFinancialCode(symbol)) {
    return null;
  }
  
  // 清理 symbol：移除特殊字元，只保留英數字
  let cleanSymbol = symbol
    .toUpperCase()
    .replace(/[:\s\-]/g, '') // 移除冒號、空白、連字號
    .replace(/[^A-Z0-9]/g, ''); // 移除其他特殊字元
  
  // 先查映射表（優先查找，包含股票與加密貨幣）
  if (STOCK_TO_DOMAIN[cleanSymbol]) {
    return STOCK_TO_DOMAIN[cleanSymbol];
  }
  
  // 對未知 symbol 嘗試推導
  // 多數公司 domain 為小寫 symbol + .com
  if (cleanSymbol.length > 0 && cleanSymbol.length <= 6) { // 合理的 symbol 長度
    return `${cleanSymbol.toLowerCase()}.com`;
  }
  
  return null;
}

/**
 * 檢查 symbol 是否為加密貨幣
 * @param symbol 資產代碼
 * @returns 若為加密貨幣則回傳 true
 */
function isCryptoSymbol(symbol: string): boolean {
  const cleanSymbol = symbol.toUpperCase().replace(/[:\s\-]/g, '').replace(/[^A-Z0-9]/g, '');
  return CRYPTO_SYMBOLS.has(cleanSymbol);
}

/**
 * 根據 symbol 取得股票 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * 加密貨幣使用：https://img.logo.dev/crypto/{SYMBOL}?token=
 * 股票優先使用 domain 推導，備選 ticker：https://img.logo.dev/ticker/{SYMBOL}?token=
 * @param symbol 股票代碼（例如：'AAPL', 'PLTR', 'BTC', 'CANYX', 'USDC.B', 'CUR:USD'）
 * @returns logo URL 或 fallback URL
 */
export function getStockLogoUrl(symbol: string): string {
  if (!symbol) {
    return FALLBACK_LOGO;
  }
  
  let upperSymbol = symbol.toUpperCase().replace(/[:\s\-]/g, '').replace(/[^A-Z0-9.]/g, '');
  
  // 處理像 USDC.B、USDT.E 的變體 - 提取基礎符號（小數點前的部分）
  if (upperSymbol.includes('.')) {
    upperSymbol = upperSymbol.split('.')[0]!;
  }
  
  // 檢查是否為加密貨幣，使用對應的 API 路徑
  if (isCryptoSymbol(upperSymbol)) {
    return buildLogoDevUrl(upperSymbol, 'crypto');
  }
  
  // 對股票優先嘗試推導 domain
  const domain = inferDomainFromSymbol(upperSymbol);
  if (domain) {
    return buildLogoDevUrl(domain, 'domain');
  }
  
  // 若無法推導 domain，再使用 ticker 路徑作為備選
  return buildLogoDevUrl(upperSymbol, 'ticker');
}

/**
 * 根據投資機構名稱取得機構 logo URL
 * 使用 Logo.dev API (https://www.logo.dev/)
 * @param institutionName 機構名稱（例如：'Fidelity', 'Interactive Brokers - Rick'）
 * @returns logo URL
 */
export function getInstitutionLogoUrl(institutionName: string): string {
  if (!institutionName) {
    return FALLBACK_LOGO;
  }
  
  // 清理機構名稱：移除使用者特定後綴（如 " - Rick"、" (Rick)"）
  let cleanInstitutionName = institutionName
    .replace(/\s*[\-–—]\s*[A-Za-z0-9]+\s*$/, '') // 移除 " - Username" 格式
    .replace(/\s*\([A-Za-z0-9]+\)\s*$/, '') // 移除 " (Username)" 格式
    .trim();
  
  // 檢查清理後的機構映射表
  const domain = INSTITUTION_TO_DOMAIN[cleanInstitutionName] || 
                 INSTITUTION_TO_DOMAIN[institutionName] || 
                 inferDomainFromInstitution(cleanInstitutionName);
  
  return buildLogoDevUrl(domain, 'domain');
}

/**
 * 推導投資機構的 domain
 * @param institutionName 機構名稱
 * @returns domain URL
 */
function inferDomainFromInstitution(institutionName: string): string {
  // 移除常見後綴與前綴
  let cleanName = institutionName
    .toLowerCase()
    .replace(/\s+/g, '') // 移除空白
    .replace(/[&]/g, '') // 移除 &
    .replace(/[\-–—]/g, '') // 移除連字號
    .replace(/[\*]/g, '') // 移除特殊字元
    .replace(/[()]/g, ''); // 移除括號
  
  return `${cleanName}.com`;
}

/**
 * 建立 Logo.dev URL
 * @param identifier domain、symbol 或其他識別符
 * @param type 類型：'domain'、'ticker' 或 'crypto'
 * @returns logo URL
 */
export function buildLogoDevUrl(identifier: string, type: 'domain' | 'ticker' | 'crypto' = 'domain'): string {
  if (!identifier) {
    return FALLBACK_LOGO;
  }
  
  let logoUrl: string;
  
  if (type === 'crypto') {
    // 加密貨幣使用 crypto 路徑，加入格式參數以確保一致性
    logoUrl = `https://img.logo.dev/crypto/${identifier.toUpperCase()}?format=webp&size=128`;
  } else if (type === 'ticker') {
    // 股票使用 ticker 路徑，加入格式參數以確保一致性
    logoUrl = `https://img.logo.dev/ticker/${identifier.toUpperCase()}?format=webp&size=128`;
  } else {
    // 預設使用 domain 路徑
    logoUrl = `https://img.logo.dev/${identifier}?format=webp&size=128`;
  }
  
  if (LOGO_DEV_USE_TOKEN) {
    const separator = logoUrl.includes('?') ? '&' : '?';
    logoUrl += `${separator}token=${LOGO_DEV_TOKEN}`;
  }
  
  return logoUrl;
}

/**
 * 新增股票 symbol 與公司 domain 映射
 * @param symbol 股票代碼
 * @param domain 公司 domain
 */
export function addStockDomainMapping(symbol: string, domain: string): void {
  STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
}

/**
 * 批次新增映射
 * @param mappings symbol -> domain 的映射物件
 */
export function addStockDomainMappings(mappings: Record<string, string>): void {
  Object.entries(mappings).forEach(([symbol, domain]) => {
    STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
  });
}
