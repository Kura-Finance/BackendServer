/**
 * Privy 認證服務
 *
 * 取代 SRP：前端用 Privy SDK 完成登入後，把 Privy 簽發的 token 交給後端驗證。
 *   - accessToken（必填）：驗證後取得使用者 DID，是登入的權威證明
 *   - identityToken（選填）：含 linked accounts，可離線解析出 email 與 embedded wallet
 *
 * 後端僅驗證 Privy token、解析身分，再由 AuthService 對應到內部 user 並核發自有 JWT。
 */

import { PrivyClient, verifyAccessToken as privyVerifyAccessToken, isEmbeddedWalletLinkedAccount } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';
import { appLogger } from '../../logger';

export interface PrivyIdentity {
  privyUserId: string; // Privy DID (did:privy:...)
  email?: string;
  walletAddress?: string;
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

/**
 * Verify a Privy access token and return the user's DID.
 * Throws if the token is invalid, expired, or for a different app.
 * Uses local key verification if PRIVY_VERIFICATION_KEY is set,
 * otherwise falls back to Privy's JWKS endpoint (one cached network call).
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

/**
 * Resolve email + embedded wallet from a Privy identity token.
 * The SDK's users().get verifies the identity token signature (via the app's
 * JWKS) and returns the full user object. Returns the DID plus any linked
 * email / embedded wallet address.
 *
 * Returns null if no identity token is supplied (caller falls back to DID only).
 */
export async function resolveIdentityFromToken(
  identityToken: string,
): Promise<PrivyIdentity | null> {
  try {
    const user = await getClient().users().get({ id_token: identityToken });
    const accounts = (user.linked_accounts ?? []) as unknown as Array<Record<string, unknown>>;

    const emailAccount = accounts.find((a) => a.type === 'email');
    const embeddedWallet = accounts.find((a) => isEmbeddedWalletLinkedAccount(a as never));
    const anyWallet = accounts.find((a) => a.type === 'wallet');
    const wallet = embeddedWallet ?? anyWallet;

    const email = typeof emailAccount?.address === 'string' ? emailAccount.address : undefined;
    const walletAddress = typeof wallet?.address === 'string' ? wallet.address : undefined;

    return {
      privyUserId: user.id,
      ...(email ? { email } : {}),
      ...(walletAddress ? { walletAddress } : {}),
    };
  } catch (err) {
    appLogger.warn('Failed to parse Privy identity token', {
      err: err instanceof Error ? err.message : err,
    });
    return null;
  }
}
