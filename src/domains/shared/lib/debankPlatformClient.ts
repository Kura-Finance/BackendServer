import type { DeBankProtocolPosition, DeBankTokenPosition } from '../../debank/models/types';

const DEFAULT_BASE_URL = 'https://pro-openapi.debank.com/v1';

function getBaseUrl(): string {
  return process.env.DEBANK_BASE_URL || DEFAULT_BASE_URL;
}

function getAccessKey(): string {
  const accessKey = process.env.DEBANK_ACCESS_KEY;
  if (!accessKey) {
    throw new Error('DEBANK_ACCESS_KEY is not configured');
  }
  return accessKey;
}

export function assertEvmAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid EVM wallet address');
  }
  return address.toLowerCase();
}

function computeProtocolNetUsdValue(protocol: DeBankProtocolPosition): number {
  const items = Array.isArray(protocol.portfolio_item_list) ? protocol.portfolio_item_list : [];
  return items.reduce((sum, item) => {
    const net = Number(item?.stats?.net_usd_value);
    if (Number.isFinite(net)) return sum + net;
    const asset = Number(item?.stats?.asset_usd_value || 0);
    const debt = Number(item?.stats?.debt_usd_value || 0);
    return sum + (asset - debt);
  }, 0);
}

function computeTokenUsdValue(token: DeBankTokenPosition): number {
  const usdValue = Number(token.usd_value);
  if (Number.isFinite(usdValue) && usdValue !== 0) return usdValue;
  const amount = Number(token.amount || 0);
  const price = Number(token.price || 0);
  return amount * price;
}

export interface DeBankWalletTotals {
  spotUsd: number;
  defiUsd: number;
  totalUsd: number;
}

/** 平台側 DeBank 查詢（明文 USD 加總，不經 E2EE）。 */
export async function fetchDeBankWalletTotals(address: string): Promise<DeBankWalletTotals> {
  const normalized = assertEvmAddress(address);
  const accessKey = getAccessKey();
  const baseUrl = getBaseUrl();

  const headers = {
    Accept: 'application/json',
    AccessKey: accessKey,
  };

  const [tokenRes, protocolRes] = await Promise.all([
    fetch(`${baseUrl}/user/all_token_list?id=${encodeURIComponent(normalized)}`, {
      method: 'GET',
      headers,
    }),
    fetch(`${baseUrl}/user/all_complex_protocol_list?id=${encodeURIComponent(normalized)}`, {
      method: 'GET',
      headers,
    }),
  ]);

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`DeBank token API failed: ${tokenRes.status} ${text}`);
  }
  if (!protocolRes.ok) {
    const text = await protocolRes.text();
    throw new Error(`DeBank protocol API failed: ${protocolRes.status} ${text}`);
  }

  const tokens = (await tokenRes.json()) as unknown;
  const protocols = (await protocolRes.json()) as unknown;

  const spotUsd = Array.isArray(tokens)
    ? (tokens as DeBankTokenPosition[]).reduce((sum, token) => sum + computeTokenUsdValue(token), 0)
    : 0;
  const defiUsd = Array.isArray(protocols)
    ? (protocols as DeBankProtocolPosition[]).reduce(
        (sum, protocol) => sum + computeProtocolNetUsdValue(protocol),
        0,
      )
    : 0;

  const roundedSpot = Math.round(spotUsd * 100) / 100;
  const roundedDefi = Math.round(defiUsd * 100) / 100;

  return {
    spotUsd: roundedSpot,
    defiUsd: roundedDefi,
    totalUsd: Math.round((roundedSpot + roundedDefi) * 100) / 100,
  };
}
