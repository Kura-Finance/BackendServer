/**
 * Shared symbol & exchange helpers.
 * Exchange constants/types plus stock and institution logo utilities.
 */

// ============================================
// Exchange constants and types
// ============================================

export interface SupportedExchange {
  id: string;
  displayName: string;
  requiresPassphrase: boolean;
  icon: string; // Exchange icon URL
  website?: string; // Official website
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

// Fast lookup maps
export const EXCHANGE_DISPLAY_MAP: { [key: string]: string } = KURA_SUPPORTED_EXCHANGES.reduce(
  (acc, exchange) => {
    acc[exchange.id] = exchange.displayName;
    return acc;
  },
  {} as { [key: string]: string }
);

// Exchange icon lookup map
export const EXCHANGE_ICON_MAP: { [key: string]: string } = KURA_SUPPORTED_EXCHANGES.reduce(
  (acc, exchange) => {
    acc[exchange.id] = exchange.icon;
    return acc;
  },
  {} as { [key: string]: string }
);

// Exchanges that require a passphrase
export const EXCHANGES_REQUIRING_PASSPHRASE = KURA_SUPPORTED_EXCHANGES.filter(
  (ex) => ex.requiresPassphrase
).map((ex) => ex.id);

const FALLBACK_LOGO = 'https://img.logo.dev/kura-finance.com?format=webp&size=128';

/**
 * Logo.dev API token (from env).
 * If unset, Logo.dev public endpoints are used (no auth).
 */
const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN;
const LOGO_DEV_USE_TOKEN = !!LOGO_DEV_TOKEN;

/**
 * Exchange icon URL for an exchange id.
 * @param exchangeId e.g. 'binance', 'okx'
 * @returns icon URL
 */
export function getExchangeIcon(exchangeId: string): string {
  const iconUrl = EXCHANGE_ICON_MAP[exchangeId.toLowerCase()];
  if (!iconUrl) {
    return FALLBACK_LOGO;
  }
  
  // Append Logo.dev token when configured
  if (LOGO_DEV_USE_TOKEN) {
    const separator = iconUrl.includes('?') ? '&' : '?';
    return `${iconUrl}${separator}token=${LOGO_DEV_TOKEN}`;
  }
  
  return iconUrl;
}

// ============================================
// Stock & institution logo helpers
// ============================================

/**
 * Stock symbol → company domain map.
 * Used to derive domains for symbols without a direct mapping.
 */
const STOCK_TO_DOMAIN: Record<string, string> = {
  // Tech
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
  
  // Finance
  JPM: 'jpmorganchase.com',
  BAC: 'bankofamerica.com',
  WFC: 'wellsfargo.com',
  GS: 'goldmansachs.com',
  
  // Consumer
  MCD: 'mcdonalds.com',
  KO: 'coca-cola.com',
  PEP: 'pepsico.com',
  WMT: 'walmart.com',
  COST: 'costco.com',
  
  // Energy
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  
  // Healthcare
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
  
  // Crypto
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

// Crypto symbol set (selects crypto logo API)
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

/** Broker / investment institution name → domain. */
const INSTITUTION_TO_DOMAIN: Record<string, string> = {
  // Major US brokers
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
  
  // Other financial institutions
  'Wells Fargo': 'wellsfargo.com',
  'Goldman Sachs': 'goldmansachs.com',
  'Ally': 'ally.com',
  'eTrade': 'etrade.com',
  'Tastyworks': 'tastyworks.com',
};

/**
 * Whether the symbol is a currency or unsupported asset type.
 * @param symbol Asset code
 * @returns true if currency-like
 */
function isCurrencyOrUnsupported(symbol: string): boolean {
  if (!symbol) return true;
  
  const upper = symbol.toUpperCase();
  
  // Colon usually means a currency pair (CUR:USD, USD:JPY) — IBKR format
  if (symbol.includes(':')) return true;
  
  // Common 3-letter currency codes
  const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK'];
  if (upper.length === 3 && commonCurrencies.includes(upper)) return true;
  
  // Spaced currency labels ("U S DOLLAR" — Charles Schwab format)
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
 * Whether the symbol looks like a complex instrument (bond, fund, etc.).
 * e.g. NHX105509 (bond), ZN (CBOT).
 * @param symbol symbol
 * @returns true for complex codes
 */
function isComplexFinancialCode(symbol: string): boolean {
  if (!symbol) return false;
  
  const cleanSymbol = symbol.toUpperCase();
  
  // Long alphanumeric codes (>8 chars and contains digits)
  if (cleanSymbol.length > 8 && /[0-9]/.test(cleanSymbol) && /[A-Z]/.test(cleanSymbol)) {
    return true;
  }
  
  // Futures-style codes (e.g. ZN=F, GC=F)
  if (cleanSymbol.includes('=')) {
    return true;
  }
  
  return false;
}

/**
 * Derive a company domain from a stock symbol.
 * @param symbol e.g. 'AAPL', 'PLTR', 'BTC', 'NHX105509'
 * @returns domain (e.g. 'apple.com') or null
 */
function inferDomainFromSymbol(symbol: string): string | null {
  if (!symbol) return null;
  
  // Currency or unsupported asset type
  if (isCurrencyOrUnsupported(symbol)) {
    return null;
  }
  
  // Complex instruments (bonds, funds, etc.)
  // Usually no domain — return null for fallback
  if (isComplexFinancialCode(symbol)) {
    return null;
  }
  
  // Clean symbol: keep alphanumeric only
  let cleanSymbol = symbol
    .toUpperCase()
    .replace(/[:\s\-]/g, '') // strip colon, space, hyphen
    .replace(/[^A-Z0-9]/g, ''); // strip other special chars
  
  // Prefer explicit map (stocks + crypto)
  if (STOCK_TO_DOMAIN[cleanSymbol]) {
    return STOCK_TO_DOMAIN[cleanSymbol];
  }
  
  // Heuristic for unknown symbols
  // Most company domains are lowercase symbol + .com
  if (cleanSymbol.length > 0 && cleanSymbol.length <= 6) { // reasonable ticker length
    return `${cleanSymbol.toLowerCase()}.com`;
  }
  
  return null;
}

/**
 * Whether the symbol is a cryptocurrency.
 * @param symbol Asset code
 * @returns true if crypto
 */
function isCryptoSymbol(symbol: string): boolean {
  const cleanSymbol = symbol.toUpperCase().replace(/[:\s\-]/g, '').replace(/[^A-Z0-9]/g, '');
  return CRYPTO_SYMBOLS.has(cleanSymbol);
}

/**
 * Stock/crypto logo URL via Logo.dev (https://www.logo.dev/).
 * Crypto: https://img.logo.dev/crypto/{SYMBOL}?token=
 * Stocks prefer derived domain; ticker fallback: https://img.logo.dev/ticker/{SYMBOL}?token=
 * @param symbol e.g. 'AAPL', 'PLTR', 'BTC', 'CANYX', 'USDC.B', 'CUR:USD'
 * @returns logo URL or fallback URL
 */
export function getStockLogoUrl(symbol: string): string {
  if (!symbol) {
    return FALLBACK_LOGO;
  }
  
  let upperSymbol = symbol.toUpperCase().replace(/[:\s\-]/g, '').replace(/[^A-Z0-9.]/g, '');
  
  // Variants like USDC.B / USDT.E — use base symbol before the dot
  if (upperSymbol.includes('.')) {
    upperSymbol = upperSymbol.split('.')[0]!;
  }
  
  // Crypto → crypto logo API path
  if (isCryptoSymbol(upperSymbol)) {
    return buildLogoDevUrl(upperSymbol, 'crypto');
  }
  
  // Stocks: prefer derived domain
  const domain = inferDomainFromSymbol(upperSymbol);
  if (domain) {
    return buildLogoDevUrl(domain, 'domain');
  }
  
  // Fallback to ticker path when domain unknown
  return buildLogoDevUrl(upperSymbol, 'ticker');
}

/**
 * Institution logo URL via Logo.dev.
 * Uses Logo.dev API (https://www.logo.dev/).
 * @param institutionName e.g. 'Fidelity', 'Interactive Brokers - Rick'
 * @returns logo URL
 */
export function getInstitutionLogoUrl(institutionName: string): string {
  if (!institutionName) {
    return FALLBACK_LOGO;
  }
  
  // Strip user-specific suffixes (e.g. " - Rick", " (Rick)")
  let cleanInstitutionName = institutionName
    .replace(/\s*[\-–—]\s*[A-Za-z0-9]+\s*$/, '') // strip " - Username"
    .replace(/\s*\([A-Za-z0-9]+\)\s*$/, '') // strip " (Username)"
    .trim();
  
  // Look up cleaned name in institution map
  const domain = INSTITUTION_TO_DOMAIN[cleanInstitutionName] || 
                 INSTITUTION_TO_DOMAIN[institutionName] || 
                 inferDomainFromInstitution(cleanInstitutionName);
  
  return buildLogoDevUrl(domain, 'domain');
}

/**
 * Derive an institution domain from its name.
 * @param institutionName Institution name
 * @returns domain URL
 */
function inferDomainFromInstitution(institutionName: string): string {
  // Strip common prefixes/suffixes
  let cleanName = institutionName
    .toLowerCase()
    .replace(/\s+/g, '') // strip whitespace
    .replace(/[&]/g, '') // strip &
    .replace(/[\-–—]/g, '') // strip hyphens
    .replace(/[\*]/g, '') // strip special chars
    .replace(/[()]/g, ''); // strip parentheses
  
  return `${cleanName}.com`;
}

/**
 * Build a Logo.dev URL.
 * @param identifier domain, symbol, or other id
 * @param type 'domain' | 'ticker' | 'crypto'
 * @returns logo URL
 */
export function buildLogoDevUrl(identifier: string, type: 'domain' | 'ticker' | 'crypto' = 'domain'): string {
  if (!identifier) {
    return FALLBACK_LOGO;
  }
  
  let logoUrl: string;
  
  if (type === 'crypto') {
    // Crypto path + format params for consistency
    logoUrl = `https://img.logo.dev/crypto/${identifier.toUpperCase()}?format=webp&size=128`;
  } else if (type === 'ticker') {
    // Ticker path + format params for consistency
    logoUrl = `https://img.logo.dev/ticker/${identifier.toUpperCase()}?format=webp&size=128`;
  } else {
    // Default: domain path
    logoUrl = `https://img.logo.dev/${identifier}?format=webp&size=128`;
  }
  
  if (LOGO_DEV_USE_TOKEN) {
    const separator = logoUrl.includes('?') ? '&' : '?';
    logoUrl += `${separator}token=${LOGO_DEV_TOKEN}`;
  }
  
  return logoUrl;
}

/**
 * Add a stock symbol → company domain mapping.
 * @param symbol Stock ticker
 * @param domain Company domain
 */
export function addStockDomainMapping(symbol: string, domain: string): void {
  STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
}

/**
 * Batch-add symbol → domain mappings.
 * @param mappings symbol → domain object
 */
export function addStockDomainMappings(mappings: Record<string, string>): void {
  Object.entries(mappings).forEach(([symbol, domain]) => {
    STOCK_TO_DOMAIN[symbol.toUpperCase()] = domain;
  });
}
