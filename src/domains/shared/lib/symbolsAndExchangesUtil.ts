/**
 * Shared symbol & exchange helpers.
 * Exchange constants/types plus stock and institution logo utilities.
 *
 * Logos default to free public endpoints (Google favicons + jsDelivr crypto icons).
 * Set LOGO_DEV_TOKEN to optionally prefer Logo.dev instead.
 */

// ============================================
// Free public logo helpers (default)
// ============================================

/** Google favicon service — no API key. */
function googleFaviconUrl(domain: string, size = 128): string {
  const host = domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]!
    .trim()
    .toLowerCase();
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

/** Free crypto icon CDN (jsDelivr / cryptocurrency-icons) — no API key. */
function cryptoPublicIconUrl(symbol: string): string {
  const s = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${s}.png`;
}

function fallbackLogoUrl(): string {
  const csv = process.env.ALLOWED_ORIGINS || process.env.WEBAUTHN_RELATED_ORIGINS || '';
  for (const part of csv.split(',')) {
    const o = part.trim();
    if (!o || o.startsWith('android:')) continue;
    try {
      const host = new URL(o).hostname.replace(/^www\./i, '');
      if (host) return googleFaviconUrl(host);
    } catch {
      /* try next */
    }
  }
  return googleFaviconUrl('localhost');
}

const FALLBACK_LOGO = fallbackLogoUrl();

/**
 * Optional Logo.dev publishable token. When set, Logo.dev URLs are used;
 * otherwise free public favicons / crypto CDN are used.
 */
const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN?.trim();
const LOGO_DEV_USE_TOKEN = Boolean(LOGO_DEV_TOKEN);

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
    icon: googleFaviconUrl('binance.com'),
    website: 'https://www.binance.com',
  },
  {
    id: 'okx',
    displayName: 'OKX',
    requiresPassphrase: true,
    icon: googleFaviconUrl('okx.com'),
    website: 'https://www.okx.com',
  },
  {
    id: 'bybit',
    displayName: 'Bybit',
    requiresPassphrase: false,
    icon: googleFaviconUrl('bybit.com'),
    website: 'https://www.bybit.com',
  },
  {
    id: 'coinbase',
    displayName: 'Coinbase',
    requiresPassphrase: false,
    icon: googleFaviconUrl('coinbase.com'),
    website: 'https://www.coinbase.com',
  },
  {
    id: 'kraken',
    displayName: 'Kraken',
    requiresPassphrase: false,
    icon: googleFaviconUrl('kraken.com'),
    website: 'https://www.kraken.com',
  },
  {
    id: 'kucoin',
    displayName: 'KuCoin',
    requiresPassphrase: true,
    icon: googleFaviconUrl('kucoin.com'),
    website: 'https://www.kucoin.com',
  },
  {
    id: 'bitget',
    displayName: 'Bitget',
    requiresPassphrase: true,
    icon: googleFaviconUrl('bitget.com'),
    website: 'https://www.bitget.com',
  },
  {
    id: 'gateio',
    displayName: 'Gate.io',
    requiresPassphrase: false,
    icon: googleFaviconUrl('gate.io'),
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

/**
 * Exchange icon URL for an exchange id.
 * Defaults to free Google favicons; uses Logo.dev when LOGO_DEV_TOKEN is set.
 * @param exchangeId e.g. 'binance', 'okx'
 * @returns icon URL
 */
export function getExchangeIcon(exchangeId: string): string {
  const exchange = KURA_SUPPORTED_EXCHANGES.find(
    (ex) => ex.id === exchangeId.toLowerCase()
  );
  if (!exchange) {
    return FALLBACK_LOGO;
  }

  let domain: string | undefined;
  if (exchange.website) {
    try {
      domain = new URL(exchange.website).hostname.replace(/^www\./i, '');
    } catch {
      domain = undefined;
    }
  }

  if (LOGO_DEV_USE_TOKEN && domain) {
    return buildLogoDevUrl(domain, 'domain');
  }

  return EXCHANGE_ICON_MAP[exchange.id] || (domain ? googleFaviconUrl(domain) : FALLBACK_LOGO);
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
 * Stock/crypto logo URL.
 * Default: free public (jsDelivr crypto icons / Google favicons).
 * With LOGO_DEV_TOKEN: Logo.dev crypto/domain/ticker paths.
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
  
  // Crypto → free CDN or Logo.dev
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
 * Institution logo URL (free Google favicon by default; Logo.dev if token set).
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
 * Build a logo URL.
 * Without LOGO_DEV_TOKEN: Google favicons (domain/ticker) or jsDelivr crypto icons.
 * With LOGO_DEV_TOKEN: Logo.dev paths + token.
 * @param identifier domain, symbol, or other id
 * @param type 'domain' | 'ticker' | 'crypto'
 * @returns logo URL
 */
export function buildLogoDevUrl(identifier: string, type: 'domain' | 'ticker' | 'crypto' = 'domain'): string {
  if (!identifier) {
    return FALLBACK_LOGO;
  }

  // Free public defaults (no proprietary key)
  if (!LOGO_DEV_USE_TOKEN) {
    if (type === 'crypto') {
      return cryptoPublicIconUrl(identifier);
    }
    if (type === 'domain') {
      return googleFaviconUrl(identifier);
    }
    // ticker without mapped domain — best-effort favicon on inferred .com
    return googleFaviconUrl(`${identifier.toLowerCase()}.com`);
  }

  let logoUrl: string;

  if (type === 'crypto') {
    logoUrl = `https://img.logo.dev/crypto/${identifier.toUpperCase()}?format=webp&size=128`;
  } else if (type === 'ticker') {
    logoUrl = `https://img.logo.dev/ticker/${identifier.toUpperCase()}?format=webp&size=128`;
  } else {
    logoUrl = `https://img.logo.dev/${identifier}?format=webp&size=128`;
  }

  const separator = logoUrl.includes('?') ? '&' : '?';
  return `${logoUrl}${separator}token=${LOGO_DEV_TOKEN}`;
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
