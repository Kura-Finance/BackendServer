/**
 * Morpho Earn FeeWrapper vaults on Base — mirrors mobile-app OFFICIAL_FEE_WRAPPER_DEFAULTS.
 * Map: inner Morpho vault → FeeWrapper (deposit / AUM address).
 */

export type MorphoFeeWrapperMap = Record<`0x${string}`, `0x${string}`>;

export const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql';
export const MORPHO_BASE_CHAIN_ID = 8453;

/** Official-app fee-wrapper vaults on Base (inner → FeeWrapper). */
export const OFFICIAL_FEE_WRAPPER_DEFAULTS = {
  '0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9': '0x0F457aa0AfD3D208cbfEE520804118f88965a529',
  '0x94Af495DE1F56Aa5576dEB17986bDCeE5Dd9778D': '0x6D10990b11f88EE40e4ABc2f8CbE1f7194190Db0',
  '0x050cE30b927Da55177A4914EC73480238BAD56f0': '0x50e8B8B50037322BE0Efc2048d66Cb957f349816',
  '0x1deEfABEe758AAbdC29a542B24ca3b75aFD56765': '0x07540AeeD4B12408c87365417aE7CE59A966CA47',
} as const satisfies MorphoFeeWrapperMap;

export interface EarnVaultAssets {
  innerVaultAddress: string;
  feeWrapperAddress: string;
  name: string | null;
  symbol: string | null;
  totalAssetsUsd: number;
}

export interface EarnManagedAssetsSummary {
  chainId: number;
  totalAssetsUsd: number;
  vaultCount: number;
  vaults: EarnVaultAssets[];
  fetchedAt: string;
  /** Present when Morpho API failed; vaults may be empty / partial. */
  error?: string;
}

const VAULT_V2_BY_ADDRESS_QUERY = `
  query VaultV2ByAddress($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      address
      name
      symbol
      totalAssetsUsd
    }
  }
`;

type GqlVaultV2 = {
  address: string;
  name: string | null;
  symbol: string | null;
  totalAssetsUsd: number | null;
};

async function morphoQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(MORPHO_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.[0]?.message ?? `Morpho API ${res.status}`;
    throw new Error(msg);
  }
  if (!json.data) {
    throw new Error('Morpho API returned empty data');
  }
  return json.data;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Read total managed assets (USD) for Kura Earn FeeWrappers on Base.
 * AUM is taken from the FeeWrapper address (user deposit vault), not the inner vault TVL.
 */
export async function fetchEarnManagedAssets(
  feeWrapperMap: MorphoFeeWrapperMap = OFFICIAL_FEE_WRAPPER_DEFAULTS,
): Promise<EarnManagedAssetsSummary> {
  const fetchedAt = new Date().toISOString();
  const entries = Object.entries(feeWrapperMap) as Array<[`0x${string}`, `0x${string}`]>;

  try {
    const vaults = await Promise.all(
      entries.map(async ([innerVaultAddress, feeWrapperAddress]) => {
        const data = await morphoQuery<{ vaultV2ByAddress: GqlVaultV2 | null }>(
          VAULT_V2_BY_ADDRESS_QUERY,
          { address: feeWrapperAddress, chainId: MORPHO_BASE_CHAIN_ID },
        );
        const item = data.vaultV2ByAddress;
        return {
          innerVaultAddress,
          feeWrapperAddress,
          name: item?.name ?? null,
          symbol: item?.symbol ?? null,
          totalAssetsUsd: roundUsd(item?.totalAssetsUsd ?? 0),
        } satisfies EarnVaultAssets;
      }),
    );

    const totalAssetsUsd = roundUsd(
      vaults.reduce((sum, v) => sum + v.totalAssetsUsd, 0),
    );

    return {
      chainId: MORPHO_BASE_CHAIN_ID,
      totalAssetsUsd,
      vaultCount: vaults.length,
      vaults,
      fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      chainId: MORPHO_BASE_CHAIN_ID,
      totalAssetsUsd: 0,
      vaultCount: entries.length,
      vaults: entries.map(([innerVaultAddress, feeWrapperAddress]) => ({
        innerVaultAddress,
        feeWrapperAddress,
        name: null,
        symbol: null,
        totalAssetsUsd: 0,
      })),
      fetchedAt,
      error: message,
    };
  }
}
