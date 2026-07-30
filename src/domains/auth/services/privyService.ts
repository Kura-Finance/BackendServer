/**
 * Privy auth service.
 *
 * Replaces SRP: after the client logs in with the Privy SDK, it sends Privy-issued
 * tokens here for verification.
 *   - accessToken (required): verifies to the user DID — authoritative login proof
 *   - identityToken (optional): linked accounts → email + embedded wallet
 *   - If the identity token lacks email, backend fetches the full user via Privy Server API by DID
 *
 * Backend only verifies Privy tokens and resolves identity; AuthService maps to an
 * internal user and issues our own JWT.
 */

import {
  PrivyClient,
  verifyAccessToken as privyVerifyAccessToken,
  isEmbeddedWalletLinkedAccount,
  type User,
} from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';
import { appLogger } from '../../logger';

export interface PrivyIdentity {
  privyUserId: string; // Privy DID (did:privy:...)
  email?: string;
  walletAddress?: string;
}

export class PrivyTokenMismatchError extends Error {
  constructor(message = 'Identity token does not match access token') {
    super(message);
    this.name = 'PrivyTokenMismatchError';
  }
}

let _client: PrivyClient | null = null;
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getAppId(): string {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) throw new Error('PRIVY_APP_ID is not configured');
  return appId;
}

function getClient(): PrivyClient {
  if (_client) return _client;

  const appId = getAppId();
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appSecret) throw new Error('PRIVY_APP_SECRET is not configured');

  appLogger.info('[Privy] Initializing PrivyClient', { appId, hasAppSecret: true });
  _client = new PrivyClient({ appId, appSecret });
  return _client;
}

function getVerificationKey(): string | ReturnType<typeof createRemoteJWKSet> {
  const rawKey = process.env.PRIVY_VERIFICATION_KEY;
  if (rawKey) {
    // Cloud Run / k8s often stores multi-line SPKI PEM as \n-escaped single line
    return rawKey.replace(/\\n/g, '\n');
  }
  // Fall back to live JWKS fetch (cached by createRemoteJWKSet)
  if (!_jwks) {
    const appId = getAppId();
    const jwksUrl = new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
    appLogger.info('[Privy] No verification key set, using JWKS endpoint', { jwksUrl: jwksUrl.toString() });
    _jwks = createRemoteJWKSet(jwksUrl);
  }
  return _jwks;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Extract the primary email from Privy linked accounts.
 * Supports direct email login and OAuth providers that expose an email field.
 */
export function extractEmailFromLinkedAccounts(
  accounts: ReadonlyArray<Record<string, unknown>>,
): string | undefined {
  for (const account of accounts) {
    if (account.type === 'email' && typeof account.address === 'string' && account.address) {
      const normalized = normalizeEmail(account.address);
      if (isValidEmail(normalized)) {
        return normalized;
      }
    }
  }

  for (const account of accounts) {
    if (typeof account.email !== 'string' || !account.email) {
      continue;
    }
    const normalized = normalizeEmail(account.email);
    if (isValidEmail(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function extractWalletFromLinkedAccounts(
  accounts: ReadonlyArray<Record<string, unknown>>,
): string | undefined {
  const walletIndexOf = (a: Record<string, unknown>): number =>
    typeof a.wallet_index === 'number' ? a.wallet_index : Number.MAX_SAFE_INTEGER;

  const primaryEmbedded = accounts
    .filter((a) => isEmbeddedWalletLinkedAccount(a as never))
    .filter((a) => (typeof a.chain_type === 'string' ? a.chain_type : 'ethereum') === 'ethereum')
    .sort((a, b) => walletIndexOf(a) - walletIndexOf(b))[0];

  const anyWallet = accounts.find((a) => a.type === 'wallet');
  const wallet = primaryEmbedded ?? anyWallet;

  return typeof wallet?.address === 'string' ? wallet.address : undefined;
}

function identityFromPrivyUser(user: Pick<User, 'id' | 'linked_accounts'>): PrivyIdentity {
  const accounts = (user.linked_accounts ?? []) as unknown as Array<Record<string, unknown>>;
  const email = extractEmailFromLinkedAccounts(accounts);
  const walletAddress = extractWalletFromLinkedAccounts(accounts);

  appLogger.info('[Privy] Resolved identity from linked accounts', {
    privyUserId: user.id,
    hasEmail: !!email,
    embeddedWalletCount: accounts.filter((a) => isEmbeddedWalletLinkedAccount(a as never)).length,
    chosenAddressPrefix: walletAddress?.slice(0, 10),
  });

  return {
    privyUserId: user.id,
    ...(email ? { email } : {}),
    ...(walletAddress ? { walletAddress } : {}),
  };
}

/**
 * Verify a Privy access token and return the user's DID.
 * Throws if the token is invalid, expired, or for a different app.
 */
export async function verifyAccessToken(accessToken: string): Promise<string> {
  const appId = getAppId();
  const verificationKey = getVerificationKey();

  appLogger.info('[Privy] Verifying access token', {
    backendAppId: appId,
    usingLocalKey: typeof verificationKey === 'string',
    tokenPrefix: accessToken.slice(0, 20),
    tokenLength: accessToken.length,
  });

  try {
    const claims = await privyVerifyAccessToken({
      access_token: accessToken,
      app_id: appId,
      verification_key: verificationKey,
    });
    appLogger.info('[Privy] Access token verified', { userId: claims.user_id });
    return claims.user_id;
  } catch (err) {
    appLogger.error('[Privy] verifyAccessToken failed', {
      error: err instanceof Error ? err.message : String(err),
      errorJson: JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : Object(err))),
      backendAppId: appId,
    });
    throw err;
  }
}

/** Fetch full Privy user by DID via server API (includes OAuth emails omitted from identity token). */
export async function resolveIdentityFromPrivyUserId(privyUserId: string): Promise<PrivyIdentity> {
  const user = await getClient().users()._get(privyUserId);
  return identityFromPrivyUser(user);
}

/**
 * Resolve email + embedded wallet for login.
 * Tries identity token first, then Privy server API if email is still missing.
 */
export async function resolvePrivyIdentity(
  privyUserId: string,
  identityToken?: string,
): Promise<PrivyIdentity> {
  let identity: PrivyIdentity = { privyUserId };

  if (identityToken) {
    try {
      const user = await getClient().users().get({ id_token: identityToken });
      if (user.id !== privyUserId) {
        throw new PrivyTokenMismatchError();
      }
      identity = identityFromPrivyUser(user);
    } catch (err) {
      if (err instanceof PrivyTokenMismatchError) {
        throw err;
      }
      appLogger.warn('Failed to parse Privy identity token, falling back to server API', {
        privyUserId,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  if (!identity.email) {
    const fromApi = await resolveIdentityFromPrivyUserId(privyUserId);
    identity = {
      privyUserId,
      ...(fromApi.email ? { email: fromApi.email } : {}),
      ...(fromApi.walletAddress
        ? { walletAddress: fromApi.walletAddress }
        : identity.walletAddress
          ? { walletAddress: identity.walletAddress }
          : {}),
    };
  }

  return identity;
}

function getLatestVerifiedAt(user: User): number | null {
  let latest: number | null = null;
  for (const account of user.linked_accounts) {
    const ts = (account as { latest_verified_at?: number | null }).latest_verified_at;
    if (typeof ts === 'number' && Number.isFinite(ts) && (latest === null || ts > latest)) {
      latest = ts;
    }
  }
  return latest;
}

export interface PrivyUserMetrics {
  totalUsers: number;
  activeUsers: number;
  periodFrom: Date;
  periodTo: Date;
  syncedAt: Date;
}

/** List Privy users and count those with latest_verified_at in the window. */
export async function fetchPrivyUserMetrics(periodFrom: Date, periodTo: Date): Promise<PrivyUserMetrics> {
  const fromSec = Math.floor(periodFrom.getTime() / 1000);
  const toSec = Math.floor(periodTo.getTime() / 1000);
  let totalUsers = 0;
  let activeUsers = 0;

  for await (const user of getClient().users().list()) {
    totalUsers += 1;
    const latest = getLatestVerifiedAt(user);
    if (latest !== null && latest >= fromSec && latest <= toSec) {
      activeUsers += 1;
    }
  }

  appLogger.info('[Privy] User metrics fetched', {
    totalUsers,
    activeUsers,
    periodFrom: periodFrom.toISOString(),
    periodTo: periodTo.toISOString(),
  });

  return {
    totalUsers,
    activeUsers,
    periodFrom,
    periodTo,
    syncedAt: new Date(),
  };
}

/** Delete Privy user by DID (best-effort; used during account deletion). */
export async function deletePrivyUser(privyUserId: string | null | undefined): Promise<void> {
  if (!privyUserId) {
    return;
  }

  try {
    await getClient().users().delete(privyUserId);
    appLogger.info('[Privy] Deleted user during account deletion', { privyUserId });
  } catch (err) {
    appLogger.warn('Failed to delete Privy user during account deletion', {
      privyUserId,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/** @deprecated Use resolvePrivyIdentity — kept for callers that only parse identity token. */
export async function resolveIdentityFromToken(
  identityToken: string,
): Promise<PrivyIdentity | null> {
  try {
    const user = await getClient().users().get({ id_token: identityToken });
    return identityFromPrivyUser(user);
  } catch (err) {
    appLogger.warn('Failed to parse Privy identity token', {
      err: err instanceof Error ? err.message : err,
    });
    return null;
  }
}
