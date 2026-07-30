/**
 * Plaid data transformers — shared mapping and normalization helpers.
 * Kept separate from services for reuse and testability.
 */

import { BankingAccountType, TransactionType, InvestmentType, PlaidAccountBucket } from '../models/types';

/** Common crypto ticker symbols (including name variants). */
export const CRYPTO_SYMBOLS = new Set([
  // Major cryptocurrencies
  'BTC', 'BITCOIN', 'XBT',
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
  'GWEI', 'ETHEREUM_GAS',
  'USDC', 'USDT', 'BUSD', 'DAI', // Stablecoins
]);

/** Map Plaid account type/subtype to app banking type. */
export const mapPlaidAccountType = (type: string, subtype?: string | null): BankingAccountType => {
  const normalizedSubtype = (subtype || '').toLowerCase();
  if (type === 'credit') {
    return 'credit';
  }
  if (normalizedSubtype.includes('saving')) {
    return 'saving';
  }
  if (normalizedSubtype.includes('check')) {
    return 'checking';
  }
  return 'checking';
};

/** Map transaction amount/category to app transaction type. */
export const mapPlaidTransactionType = (amount: number, category?: string | null): TransactionType => {
  const normalizedCategory = (category || '').toLowerCase();
  if (normalizedCategory.includes('transfer')) {
    return 'transfer';
  }
  return amount < 0 ? 'deposit' : 'credit';
};

/** Map Plaid security type / ticker to app investment type. */
export const mapPlaidInvestmentType = (securityType?: string | null, tickerSymbol?: string | null): InvestmentType => {
  const normalized = (securityType || '').toLowerCase();

  // Prefer security.type
  if (normalized.includes('crypto') || normalized.includes('cryptocurrency')) {
    return 'crypto';
  }

  // Infer crypto from ticker_symbol when possible
  if (tickerSymbol && normalizeCryptoSymbol(tickerSymbol)) {
    return 'crypto';
  }

  if (normalized.includes('etf')) {
    return 'etf';
  }

  return 'stock';
};

/** Classify an account as banking or investment. */
export const classifyPlaidAccountBucket = (type?: string | null, subtype?: string | null): PlaidAccountBucket => {
  const normalizedType = (type || '').toLowerCase();
  const normalizedSubtype = (subtype || '').toLowerCase();

  const investmentSubtypeHints = [
    'brokerage',
    'broker',
    'hsa',
    'ira',
    '401k',
    '401(a)',
    '401',
    '403b',
    '457',
    'retirement',
  ];

  if (normalizedType === 'investment') {
    return 'investment';
  }

  if (investmentSubtypeHints.some((hint) => normalizedSubtype.includes(hint))) {
    return 'investment';
  }

  return 'banking';
};

/**
 * Normalize a crypto symbol.
 * Handles variants: "btc.com" → "BTC", "Bitcoin" → "BTC".
 */
export function normalizeCryptoSymbol(symbol: string): string | null {
  if (!symbol) return null;

  // Strip special chars and domain suffixes
  let cleaned = symbol
    .toUpperCase()
    .replace(/\.COM$|\.NET$|\.IO$/, '') // Drop domain suffix
    .replace(/[:\-_]/g, ''); // Drop separators

  if (CRYPTO_SYMBOLS.has(cleaned)) {
    return cleaned;
  }

  // Guess from common full names
  const prefixMap: Record<string, string> = {
    BITCOIN: 'BTC',
    ETHEREUM: 'ETH',
    RIPPLE: 'XRP',
    LITECOIN: 'LTC',
    DOGECOIN: 'DOGE',
    CARDANO: 'ADA',
    CHAINLINK: 'LINK',
    SOLANA: 'SOL',
    POLKADOT: 'DOT',
    AVALANCHE: 'AVAX',
  };

  for (const [full, short] of Object.entries(prefixMap)) {
    if (cleaned.includes(full)) {
      return short;
    }
  }

  return null; // Not a known crypto
}

/** True when symbol is fiat or an unsupported asset type. */
export const isCurrencyOrUnsupported = (symbol: string): boolean => {
  if (!symbol) return true;

  // Colon usually means a currency pair (CUR:USD, USD:JPY) — IBKR format
  if (symbol.includes(':')) return true;

  // Common 3-letter fiat codes
  const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK'];
  const upper = symbol.toUpperCase();
  if (upper.length === 3 && commonCurrencies.includes(upper)) return true;

  // Spaced currency names ("U S DOLLAR" — Charles Schwab format)
  if (symbol.includes(' ')) {
    const normalized = symbol.toLowerCase().replace(/\s+/g, '');
    if (normalized.includes('dollar') || normalized.includes('euro') || normalized.includes('pound') || normalized.includes('yen')) {
      return true;
    }
  }

  return false;
};
