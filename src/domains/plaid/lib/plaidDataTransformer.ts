/**
 * Plaid 資料轉換器 - 共用資料映射與正規化工具
 * 與服務邏輯解耦，提升可重用性與可測試性
 */

import { BankingAccountType, TransactionType, InvestmentType, PlaidAccountBucket } from '../models/types';

/**
 * 常見的加密貨幣代號 symbol（含各種格式變化）
 */
export const CRYPTO_SYMBOLS = new Set([
  // 主流加密貨幣
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
  'USDC', 'USDT', 'BUSD', 'DAI', // 穩定幣
]);

/**
 * 將 Plaid 帳戶類型對應到應用程式類型
 */
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

/**
 * 將交易金額對應到交易類型
 */
export const mapPlaidTransactionType = (amount: number, category?: string | null): TransactionType => {
  const normalizedCategory = (category || '').toLowerCase();
  if (normalizedCategory.includes('transfer')) {
    return 'transfer';
  }
  return amount < 0 ? 'deposit' : 'credit';
};

/**
 * 將投資商品類型對應到應用程式投資類型
 */
export const mapPlaidInvestmentType = (securityType?: string | null, tickerSymbol?: string | null): InvestmentType => {
  const normalized = (securityType || '').toLowerCase();

  // 首先檢查 security.type 欄位
  if (normalized.includes('crypto') || normalized.includes('cryptocurrency')) {
    return 'crypto';
  }

  // 嘗試從 ticker_symbol 推斷是否為加密貨幣
  if (tickerSymbol && normalizeCryptoSymbol(tickerSymbol)) {
    return 'crypto';
  }

  if (normalized.includes('etf')) {
    return 'etf';
  }

  return 'stock';
};

/**
 * 將帳戶分類為銀行帳戶或投資帳戶
 */
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
 * 正規化加密貨幣 symbol
 * 處理各種格式：\"btc.com\" -> \"BTC\"、\"Bitcoin\" -> \"BTC\"
 */
export function normalizeCryptoSymbol(symbol: string): string | null {
  if (!symbol) return null;

  // 移除特殊字符和域名部分
  let cleaned = symbol
    .toUpperCase()
    .replace(/\.COM$|\.NET$|\.IO$/, '') // 移除域名後綴
    .replace(/[:\-_]/g, ''); // 移除連接符

  // 檢查是否在加密貨幣列表中
  if (CRYPTO_SYMBOLS.has(cleaned)) {
    return cleaned;
  }

  // 基於常見前綴猜測
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

  return null; // 不是已知的加密貨幣
}

/**
 * 檢查 symbol 是否為貨幣或不支持的資產類型
 */
export const isCurrencyOrUnsupported = (symbol: string): boolean => {
  if (!symbol) return true;

  // 含冒號通常是貨幣對格式（CUR:USD、USD:JPY 等）- IBKR 格式
  if (symbol.includes(':')) return true;

  // 檢查是否為常見貨幣代碼 (3個大寫字母)
  const commonCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'MXN', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK'];
  const upper = symbol.toUpperCase();
  if (upper.length === 3 && commonCurrencies.includes(upper)) return true;

  // 檢查包含空白 space 的貨幣表示法（"U S DOLLAR" - Charles Schwab 格式）
  if (symbol.includes(' ')) {
    const normalized = symbol.toLowerCase().replace(/\s+/g, '');
    if (normalized.includes('dollar') || normalized.includes('euro') || normalized.includes('pound') || normalized.includes('yen')) {
      return true;
    }
  }

  return false;
};
