/** Dinari wallet helpers: chain IDs, address normalization, connect-target checks. */

import type { WalletChainID } from '@dinari/api-sdk/resources/v2/accounts/wallet/external';

/** Chain IDs accepted by Dinari Connect Wallet API (see docs.dinari.com). */
export const DINARI_WALLET_CONNECT_CHAIN_IDS = new Set<string>([
  'eip155:0',
  'eip155:1',
  'eip155:42161',
  'eip155:8453',
  'eip155:81457',
  'eip155:98866',
  'eip155:999',
  'eip155:43114',
  'eip155:202110',
]);

/** SDK-typed testnets rejected by Connect Wallet enterprise API (422). */
const WALLET_CONNECT_UNSUPPORTED_CHAIN_IDS = new Set<string>([
  'eip155:84532',
  'eip155:11155111',
  'eip155:421614',
]);

/** Additional chain IDs typed by the Dinari SDK (non–wallet-connect paths). */
const DINARI_WALLET_CHAIN_IDS = new Set<string>([
  ...DINARI_WALLET_CONNECT_CHAIN_IDS,
  ...WALLET_CONNECT_UNSUPPORTED_CHAIN_IDS,
  'eip155:168587773',
  'eip155:98867',
  'eip155:179205',
  'eip155:179202',
  'eip155:98865',
  'eip155:7887',
]);

const NUMERIC_CHAIN_TO_CAIP2: Record<string, WalletChainID> = {
  '0': 'eip155:0',
  '1': 'eip155:1',
  '42161': 'eip155:42161',
  '8453': 'eip155:8453',
  '81457': 'eip155:81457',
  '98866': 'eip155:98866',
  '11155111': 'eip155:11155111',
  '421614': 'eip155:421614',
  '84532': 'eip155:84532',
  '168587773': 'eip155:168587773',
  '98867': 'eip155:98867',
  '202110': 'eip155:202110',
  '179205': 'eip155:179205',
  '179202': 'eip155:179202',
  '98865': 'eip155:98865',
  '7887': 'eip155:7887',
};

export function defaultDinariChainId(): WalletChainID {
  const fromEnv = process.env.DINARI_DEFAULT_CHAIN_ID ?? process.env.DINARI_CHAIN_ID;
  if (fromEnv) {
    return normalizeWalletConnectChainId(fromEnv);
  }
  // Dinari external wallet nonce/connect accepts Base (eip155:8453) in sandbox + production.
  // Sandbox mockUSD is minted on the connected chain. Override via env if Dinari adds testnets.
  return 'eip155:8453';
}

/** Normalize an EVM address to lowercase `0x` + 40 hex. */
export function normalizeEvmAddress(address: string): string {
  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error('walletAddress must be a valid EVM address (0x + 40 hex chars)');
  }
  return trimmed.toLowerCase();
}

/** Normalize input to a CAIP-2 chain id accepted by Dinari Connect Wallet. */
export function normalizeWalletConnectChainId(chainId: string): WalletChainID {
  const raw = chainId.trim();
  let resolved: WalletChainID;

  if (raw.startsWith('eip155:')) {
    if (!DINARI_WALLET_CHAIN_IDS.has(raw)) {
      throw new Error(`Unsupported chainId: ${raw}`);
    }
    resolved = raw as WalletChainID;
  } else {
    const mapped = NUMERIC_CHAIN_TO_CAIP2[raw];
    if (!mapped) {
      throw new Error(`Unsupported chainId: ${raw}. Use CAIP-2 (e.g. eip155:8453) or numeric chain id.`);
    }
    resolved = mapped;
  }

  if (WALLET_CONNECT_UNSUPPORTED_CHAIN_IDS.has(resolved)) {
    throw new Error(
      `chainId ${resolved} is not supported for Dinari wallet connect. Use eip155:8453 (Base) or eip155:0 for EOA.`,
    );
  }
  if (!DINARI_WALLET_CONNECT_CHAIN_IDS.has(resolved)) {
    throw new Error(`chainId ${resolved} is not supported for Dinari wallet connect.`);
  }
  return resolved;
}

/** Normalize `84532` / `eip155:84532` etc. to CAIP-2 (includes SDK-only testnets). */
export function normalizeChainId(chainId: string): WalletChainID {
  const raw = chainId.trim();

  if (raw.startsWith('eip155:')) {
    if (!DINARI_WALLET_CHAIN_IDS.has(raw)) {
      throw new Error(`Unsupported chainId: ${raw}`);
    }
    return raw as WalletChainID;
  }

  const mapped = NUMERIC_CHAIN_TO_CAIP2[raw];
  if (!mapped) {
    throw new Error(`Unsupported chainId: ${raw}. Use CAIP-2 (e.g. eip155:8453) or numeric chain id.`);
  }
  return mapped;
}

/**
 * Ordered chain_id candidates to try when fetching a wallet nonce.
 *
 * Dinari sandbox / production Connect Wallet both use Base mainnet (eip155:8453).
 * Some 422s omit field_errors; getWalletNonce tries candidates in order.
 *
 * - Explicit chainId → tried first (unsupported testnets may still 422).
 * - Default → Base mainnet, then Ethereum / Arbitrum / EOA.
 */
export function walletNonceChainCandidates(explicitChainId?: string | null): WalletChainID[] {
  const defaults: WalletChainID[] = [
    defaultDinariChainId(),
    'eip155:1',
    'eip155:42161',
    'eip155:0',
  ];

  const ordered: WalletChainID[] = [];
  if (explicitChainId) ordered.push(normalizeChainId(explicitChainId));
  ordered.push(...defaults);
  return [...new Set(ordered)];
}

/**
 * Infer chain_id for wallet connect.
 * - User SCA → eip155:8453 (Dinari sandbox / production)
 * - User EOA → eip155:0 (Dinari convention)
 */
export function resolveWalletChainId(
  walletAddress: string,
  opts: {
    chainId?: string | undefined;
    userWalletAddress?: string | null | undefined;
    userScaAddress?: string | null | undefined;
  },
): WalletChainID {
  if (opts.chainId) {
    return normalizeWalletConnectChainId(opts.chainId);
  }

  const normalized = normalizeEvmAddress(walletAddress);
  const target = classifyWalletConnectTarget(normalized, {
    walletAddress: opts.userWalletAddress,
    scaAddress: opts.userScaAddress,
  });

  return target === 'eoa' ? 'eip155:0' : defaultDinariChainId();
}

export function formatDinariFieldErrors(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const root = error as {
    error_id?: string;
    message?: string;
    error?: {
      field_errors?: Array<Record<string, unknown>>;
      body_error?: string | null;
    };
    field_errors?: Array<Record<string, unknown>>;
    body_error?: string | null;
  };
  const inner = root.error ?? root;
  const fieldErrors = inner.field_errors;
  const parts: string[] = [];
  if (root.error_id) parts.push(`error_id=${root.error_id}`);
  if (inner.body_error) parts.push(String(inner.body_error));
  if (root.message && root.message !== 'Unprocessable Entity') parts.push(root.message);
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    parts.push(
      ...fieldErrors.map((e) => {
        const name = String(e.field_name ?? e.field ?? 'field');
        const msg = String(e.field_error ?? e.message ?? e.error ?? 'invalid');
        return `${name}: ${msg}`;
      }),
    );
  }
  return parts.length > 0 ? parts.join('; ') : undefined;
}

export type WalletConnectTarget = 'eoa' | 'sca';

/** Ensure the address belongs to this user; fail before calling Dinari otherwise. */
export function classifyWalletConnectTarget(
  normalizedAddress: string,
  user: { walletAddress?: string | null | undefined; scaAddress?: string | null | undefined },
): WalletConnectTarget {
  const eoa = user.walletAddress ? normalizeEvmAddress(user.walletAddress) : null;
  const sca = user.scaAddress ? normalizeEvmAddress(user.scaAddress) : null;

  if (sca && normalizedAddress === sca) return 'sca';
  if (eoa && normalizedAddress === eoa) return 'eoa';

  const hints: string[] = [];
  if (sca) hints.push(`scaAddress ${sca}`);
  if (eoa) hints.push(`walletAddress ${eoa}`);
  if (hints.length === 0) {
    throw new Error(
      'Register your wallet first: PATCH /api/wallet/sca with scaAddress before connecting Dinari.',
    );
  }
  throw new Error(`walletAddress must match your ${hints.join(' or ')}.`);
}
