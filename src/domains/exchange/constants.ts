/**
 * Exchange Constants and Types
 */

export interface SupportedExchange {
  id: string;
  displayName: string;
  requiresPassphrase: boolean;
  icon: string; // 交易所圖標 URL
  website?: string; // 官方網站
}

export const KURA_SUPPORTED_EXCHANGES: SupportedExchange[] = [
  {
    id: 'binance',
    displayName: 'Binance',
    requiresPassphrase: false,
    icon: 'https://www.google.com/s2/favicons?domain=binance.com&sz=128',
    website: 'https://www.binance.com',
  },
  {
    id: 'okx',
    displayName: 'OKX',
    requiresPassphrase: true,
    icon: 'https://www.google.com/s2/favicons?domain=okx.com&sz=128',
    website: 'https://www.okx.com',
  },
  {
    id: 'bybit',
    displayName: 'Bybit',
    requiresPassphrase: false,
    icon: 'https://www.google.com/s2/favicons?domain=bybit.com&sz=128',
    website: 'https://www.bybit.com',
  },
  {
    id: 'coinbase',
    displayName: 'Coinbase',
    requiresPassphrase: false,
    icon: 'https://www.google.com/s2/favicons?domain=coinbase.com&sz=128',
    website: 'https://www.coinbase.com',
  },
  {
    id: 'kraken',
    displayName: 'Kraken',
    requiresPassphrase: false,
    icon: 'https://www.google.com/s2/favicons?domain=kraken.com&sz=128',
    website: 'https://www.kraken.com',
  },
  {
    id: 'kucoin',
    displayName: 'KuCoin',
    requiresPassphrase: true,
    icon: 'https://www.google.com/s2/favicons?domain=kucoin.com&sz=128',
    website: 'https://www.kucoin.com',
  },
  {
    id: 'bitget',
    displayName: 'Bitget',
    requiresPassphrase: true,
    icon: 'https://www.google.com/s2/favicons?domain=bitget.com&sz=128',
    website: 'https://www.bitget.com',
  },
  {
    id: 'gateio',
    displayName: 'Gate.io',
    requiresPassphrase: false,
    icon: 'https://www.google.com/s2/favicons?domain=gate.io&sz=128',
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

// 需要密語的交易所列表
export const EXCHANGES_REQUIRING_PASSPHRASE = KURA_SUPPORTED_EXCHANGES.filter(
  (ex) => ex.requiresPassphrase
).map((ex) => ex.id);
