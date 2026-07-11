/**
 * Gnosis Pay API Service
 *
 * Auth flow (SIWE):
 *   1. Frontend requests nonce   → GET  /api/card/gp/nonce?address=0x...
 *   2. Frontend signs SIWE msg   → wallet.signMessage(siweMessage)
 *   3. Frontend submits sig      → POST /api/card/gp/auth { message, signature }
 *   4. Backend authenticates GP  → stores JWT in CardWallet
 *
 * GP API base: https://api.gnosispay.com/api/v1
 * JWT TTL: 1–24h; refresh requires user re-sign SIWE
 */

import { prisma } from '../../shared/lib/database';
import { appLogger } from '../../logger';
import { EncryptionUtil } from '../../shared/lib/encryption';

const GP_API = 'https://api.gnosispay.com/api/v1';
const GP_PARTNER_ID = process.env.GNOSIS_PAY_PARTNER_ID; // optional for permissionless dev

// ── HTTP helpers ─────────────────────────────────────────────────────────────

// Configured SIWE domain. GP validates this against its whitelist; `localhost`
// (with or without port) is always auto-allowed and is useful for diagnosis.
function gpSiweDomain(): string {
  return process.env.GNOSIS_PAY_SIWE_DOMAIN ?? 'api.kura-finance.com';
}

// localhost must use http; everything else uses https.
function gpScheme(domain: string): string {
  return /^localhost(:\d+)?$/.test(domain) ? 'http' : 'https';
}

/**
 * Parse a GP response body safely.
 * - 204 / empty body → undefined
 * - Content-Type: application/json → JSON.parse
 * - Plain text (e.g. nonce endpoint returns raw string) → try JSON first,
 *   fall back to returning the raw string cast to T
 */
async function parseGpResponse<T>(res: globalThis.Response): Promise<T> {
  const contentLength = res.headers.get('content-length');
  if (res.status === 204 || contentLength === '0') {
    return undefined as unknown as T;
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T;
  }

  // GP returns some responses (e.g. nonce) as plain text; attempt JSON first,
  // fall back to the raw string so callers can handle it.
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function gpFetch<T>(
  path: string,
  jwt: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${GP_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GnosisPayError(res.status, body, path);
  }
  return parseGpResponse<T>(res);
}

async function gpPublicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GP_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GnosisPayError(res.status, body, path);
  }
  return parseGpResponse<T>(res);
}

export class GnosisPayError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly gpBody: string,
    public readonly path: string,
  ) {
    super(`Gnosis Pay API error ${statusCode} on ${path}: ${gpBody}`);
    this.name = 'GnosisPayError';
  }
  get isUnauthorized(): boolean { return this.statusCode === 401; }
  get isConflict(): boolean { return this.statusCode === 409; }
}

// ── JWT storage helpers ──────────────────────────────────────────────────────

export async function getStoredJwt(userId: string): Promise<string | null> {
  const wallet = await prisma.cardWallet.findUnique({
    where: { userId },
    select: { gpJwt: true, gpJwtExpiresAt: true },
  });
  if (!wallet?.gpJwt) return null;
  // Treat as expired 5 min early to avoid edge cases
  const expiryBuffer = 5 * 60 * 1000;
  if (wallet.gpJwtExpiresAt && wallet.gpJwtExpiresAt.getTime() - Date.now() < expiryBuffer) {
    return null;
  }
  return EncryptionUtil.decrypt(wallet.gpJwt);
}

export async function requireJwt(userId: string): Promise<string> {
  const jwt = await getStoredJwt(userId);
  if (!jwt) {
    throw new GnosisPayError(401, 'GP session expired or not found', 'requireJwt');
  }
  return jwt;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function getNonce(address: string): Promise<{ nonce: string; message: string }> {
  // GP nonce endpoint returns either:
  //   - a plain-text hex nonce string (e.g. "784539cbe1...")
  //   - a JSON object { nonce, message? }
  const raw = await gpPublicFetch<{ nonce: string; message?: string } | string>(
    `/auth/nonce?address=${encodeURIComponent(address)}`,
  );

  const nonce = typeof raw === 'string' ? raw : raw.nonce;

  // Log raw GP response so we can trace format changes
  appLogger.info('[GnosisPayService] GP nonce raw response', {
    type: typeof raw,
    isString: typeof raw === 'string',
    hasMessageField: typeof raw === 'object' && 'message' in raw,
    noncePreview: nonce.slice(0, 16),
  });

  // If GP already returned a fully-formed EIP-4361 SIWE message, use it directly
  const prebuilt = typeof raw === 'object' ? raw.message : undefined;
  if (prebuilt) {
    appLogger.info('[GnosisPayService] Using GP-provided SIWE message');
    return { nonce, message: prebuilt };
  }

  // GP returned a raw nonce — build the standard EIP-4361 message ourselves.
  // The `domain` MUST be whitelisted in the GP Partner Dashboard for production.
  // `localhost`/`localhost:PORT` is auto-allowed by GP (useful for diagnosing
  // whitelist issues). Set via GNOSIS_PAY_SIWE_DOMAIN env var.
  const domain = gpSiweDomain();
  const uri = `${gpScheme(domain)}://${domain}`;
  const issuedAt = new Date().toISOString();

  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Gnosis Pay',
    '',
    `URI: ${uri}`,
    'Version: 1',
    'Chain ID: 100',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');

  appLogger.info('[GnosisPayService] Built EIP-4361 SIWE message', {
    domain,
    address,
    noncePreview: nonce.slice(0, 16),
    messagePreview: message.slice(0, 60),
  });

  return { nonce, message };
}

export async function authenticate(
  userId: string,
  message: string,
  signature: string,
): Promise<{ jwt: string; address: string }> {
  const data = await gpPublicFetch<{ token: string; expiresIn: number }>(
    '/auth/challenge',
    {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    },
  );

  // Extract address from SIWE message — fail fast if not found
  const addressMatch = message.match(/^(0x[0-9a-fA-F]{40})/m);
  const address = addressMatch?.[1];
  if (!address) {
    throw new GnosisPayError(400, 'Cannot extract wallet address from SIWE message', 'authenticate');
  }

  // expiresIn is seconds
  const expiresAt = new Date(Date.now() + data.expiresIn * 1000);

  const encryptedJwt = EncryptionUtil.encrypt(data.token);
  await prisma.cardWallet.upsert({
    where: { userId },
    create: {
      userId,
      address,
      chainId: 100,
      gpJwt: encryptedJwt,
      gpJwtExpiresAt: expiresAt,
    },
    update: {
      address,
      gpJwt: encryptedJwt,
      gpJwtExpiresAt: expiresAt,
    },
  });

  appLogger.info('[GnosisPayService] User authenticated with GP', { userId, address });
  return { jwt: data.token, address };
}

// ── Signup & Terms ───────────────────────────────────────────────────────────

export async function signUp(userId: string, email?: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch('/auth/signup', jwt, {
    method: 'POST',
    body: JSON.stringify({
      ...(email ? { authEmail: email } : {}),
      ...(GP_PARTNER_ID ? { partnerId: GP_PARTNER_ID } : {}),
    }),
  });
}

export interface GpTerm {
  id: string;      // e.g. "general-tos"
  version: string; // e.g. "TOS_GENERAL_VERSION_1"
  accepted: boolean;
}

/** Fetch all GP Terms of Service for the user (some may already be accepted). */
export async function getTerms(userId: string): Promise<GpTerm[]> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<GpTerm[] | Record<string, unknown>>('/user/terms', jwt);
  return Array.isArray(data) ? data : ((data as Record<string, unknown>).terms as GpTerm[]) ?? [];
}

/**
 * Accept one or more GP Terms of Service.
 * Pass the array returned by getTerms() filtered to unaccepted items,
 * or pass nothing to auto-fetch and accept all pending terms.
 */
export async function acceptTerms(userId: string, terms?: GpTerm[]): Promise<void> {
  const jwt = await requireJwt(userId);

  const toAccept = terms ?? (await getTerms(userId)).filter(t => !t.accepted);

  for (const term of toAccept) {
    await gpFetch('/user/terms', jwt, {
      method: 'POST',
      body: JSON.stringify({ terms: term.id, version: term.version }),
    });
  }

  if (toAccept.length > 0) {
    await prisma.cardWallet.update({
      where: { userId },
      data: { gpTermsAccepted: true },
    });
  }
}

// ── KYC ─────────────────────────────────────────────────────────────────────

export async function getKycWebUrl(userId: string): Promise<{ url: string }> {
  const jwt = await requireJwt(userId);
  return gpFetch<{ url: string }>('/kyc/integration', jwt);
}

export async function getKycSdkToken(userId: string): Promise<{ token: string }> {
  const jwt = await requireJwt(userId);
  return gpFetch<{ token: string }>('/kyc/integration/sdk', jwt);
}

// ── Source of Funds ──────────────────────────────────────────────────────────

export interface SofQuestion {
  question: string;
  answers: string[]; // possible answer options
}

export interface SofAnswer {
  question: string;
  answer: string;
}

/** Fetch the list of SoF questions and possible answers from GP. */
export async function getSofQuestions(userId: string): Promise<SofQuestion[]> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<SofQuestion[] | Record<string, unknown>>('/source-of-funds', jwt);
  return Array.isArray(data) ? data : ((data as Record<string, unknown>).questions as SofQuestion[]) ?? [];
}

/** Submit all SoF answers. `answers` must include every required question. */
export async function submitSourceOfFunds(userId: string, answers: SofAnswer[]): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch('/source-of-funds', jwt, {
    method: 'POST',
    body: JSON.stringify(answers),
  });
  await prisma.cardWallet.update({
    where: { userId },
    data: { gpSofCompleted: true },
  });
}

// ── Phone Verification ───────────────────────────────────────────────────────

export async function sendPhoneOtp(userId: string, phone: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch('/verification', jwt, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: phone }),
  });
}

export async function verifyPhoneOtp(userId: string, code: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch('/verification/check', jwt, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  await prisma.cardWallet.update({
    where: { userId },
    data: { gpPhoneVerified: true },
  });
}

// ── User Status ──────────────────────────────────────────────────────────────

export interface GpUserStatus {
  kycStatus: string;              // notStarted | documentsRequested | pending | processing | approved | resubmissionRequested | rejected | requiresAction
  accountStatus: number;          // 0 = Safe fully configured
  safeAddress: string | null;
  safeReady: boolean;             // true when safeWallet array is non-empty
  currency: string | null;
  sofAnswered: boolean;           // isSourceOfFundsAnswered
  phoneValidated: boolean;        // isPhoneValidated
}

export async function getUserStatus(userId: string): Promise<GpUserStatus> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<Record<string, unknown>>('/user', jwt);

  // safeWallet is an array; non-empty means Safe is deployed
  const safeWallet = data.safeWallet as unknown[] | undefined;
  const safeAddress = (data.safeAddress as string) ?? null;

  const status: GpUserStatus = {
    kycStatus: (data.kycStatus as string) ?? 'notStarted',
    accountStatus: (data.accountStatus as number) ?? -1,
    safeAddress,
    safeReady: Array.isArray(safeWallet) && safeWallet.length > 0,
    currency: (data.currency as string) ?? null,
    sofAnswered: (data.isSourceOfFundsAnswered as boolean) ?? false,
    phoneValidated: (data.isPhoneValidated as boolean) ?? false,
  };

  // Sync GP status back to DB
  await prisma.cardWallet.updateMany({
    where: { userId },
    data: {
      gpKycStatus: status.kycStatus,
      gpAccountStatus: status.accountStatus,
      ...(status.safeAddress ? { gpSafeAddress: status.safeAddress } : {}),
      ...(status.currency ? { gpCurrency: status.currency } : {}),
      gpSofCompleted: status.sofAnswered,
      gpPhoneVerified: status.phoneValidated,
    },
  });

  return status;
}

// ── Safe Deployment ──────────────────────────────────────────────────────────

export async function deploySafe(userId: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch('/safe/deploy', jwt, { method: 'POST' });
  appLogger.info('[GnosisPayService] Safe deployment initiated', { userId });
}

export interface SafeDeployStatus {
  status: string;  // e.g. "pending" | "completed" | "failed"
  safeAddress: string | null;
}

/** Poll Safe deployment progress. Deployment can take up to ~1 minute. */
export async function getSafeDeployStatus(userId: string): Promise<SafeDeployStatus> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<Record<string, unknown>>('/safe/deploy', jwt);
  return {
    status: (data.status as string) ?? 'pending',
    safeAddress: (data.safeAddress as string) ?? null,
  };
}

export async function getSafeConfig(userId: string): Promise<{
  safeAddress: string | null;
  accountStatus: number;
  currency: string | null;
}> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<Record<string, unknown>>('/safe-config', jwt);

  const safeAddress = (data.safeAddress as string) ?? null;
  const accountStatus = (data.accountStatus as number) ?? -1;
  const currency = (data.currency as string) ?? null;

  if (safeAddress) {
    await prisma.cardWallet.updateMany({
      where: { userId },
      data: { gpSafeAddress: safeAddress, gpAccountStatus: accountStatus, gpCurrency: currency ?? undefined },
    });
  }

  return { safeAddress, accountStatus, currency };
}

// ── Card Issuance ────────────────────────────────────────────────────────────

export interface GpCard {
  id: string;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  status: string; // active | frozen | cancelled | ...
  isVirtual: boolean;
}

export async function createVirtualCard(userId: string): Promise<GpCard> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<Record<string, unknown>>('/cards/virtual', jwt, { method: 'POST' });

  const card: GpCard = {
    id: data.id as string,
    last4: (data.last4 as string) ?? null,
    expiryMonth: (data.expiryMonth as number) ?? null,
    expiryYear: (data.expiryYear as number) ?? null,
    status: (data.status as string) ?? 'active',
    isVirtual: true,
  };

  const wallet = await prisma.cardWallet.findUnique({ where: { userId }, select: { gpCurrency: true } });
  const currency = wallet?.gpCurrency ?? 'EURe';

  // Upsert CardAccount
  await prisma.cardAccount.upsert({
    where: { providerCardId: card.id },
    create: {
      userId,
      providerCardId: card.id,
      last4: card.last4,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      status: 'active',
      isVirtual: true,
      currency,
    },
    update: {
      ...(card.last4 !== null ? { last4: card.last4 } : {}),
      ...(card.expiryMonth !== null ? { expiryMonth: card.expiryMonth } : {}),
      ...(card.expiryYear !== null ? { expiryYear: card.expiryYear } : {}),
      status: 'active',
    },
  });

  await prisma.cardWallet.update({ where: { userId }, data: { gpCardId: card.id } });
  appLogger.info('[GnosisPayService] Virtual card created', { userId, cardId: card.id });
  return card;
}

export async function getCards(userId: string): Promise<GpCard[]> {
  const jwt = await requireJwt(userId);
  const data = await gpFetch<unknown[]>('/cards', jwt);
  return (data ?? []).map((c): GpCard => {
    const card = c as Record<string, unknown>;
    return {
      id: card.id as string,
      last4: (card.last4 as string) ?? null,
      expiryMonth: (card.expiryMonth as number) ?? null,
      expiryYear: (card.expiryYear as number) ?? null,
      status: (card.status as string) ?? 'active',
      isVirtual: !!(card.isVirtual),
    };
  });
}

export async function freezeCard(userId: string, cardId: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch(`/cards/${cardId}/freeze`, jwt, { method: 'PATCH' });
  await prisma.cardAccount.updateMany({
    where: { userId, providerCardId: cardId },
    data: { status: 'frozen', frozenAt: new Date() },
  });
}

export async function unfreezeCard(userId: string, cardId: string): Promise<void> {
  const jwt = await requireJwt(userId);
  await gpFetch(`/cards/${cardId}/unfreeze`, jwt, { method: 'PATCH' });
  await prisma.cardAccount.updateMany({
    where: { userId, providerCardId: cardId },
    data: { status: 'active', frozenAt: null },
  });
}

// ── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(userId: string): Promise<unknown[]> {
  const jwt = await requireJwt(userId);
  return gpFetch<unknown[]>('/cards/transactions', jwt);
}