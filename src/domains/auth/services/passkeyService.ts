/**
 * Passkey / WebAuthn service.
 *
 * After Privy login, unlock the E2EE data layer with a Passkey (WebAuthn):
 *   - Register: standard WebAuthn registration; store DEK wrapped with passkey PRF (encryptedDek)
 *   - Authenticate: standard WebAuthn assertion; return that device's encryptedDek
 *
 * All flows require login (requireAuth). Challenges are keyed by userId in the DB
 * so verification works across multiple Cloud Run instances.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logBusinessEvent } from '../../logger';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Shared RP ID for web + mobile (api.kura-finance.com). Web uses Related Origin Requests. */
function getRpId(): string {
  const rpId = process.env.WEBAUTHN_RP_ID;
  if (!rpId) throw new Error('WEBAUTHN_RP_ID is not configured');
  return rpId;
}

function getRpName(): string {
  return process.env.WEBAUTHN_RP_NAME || 'Kura';
}

// Allowed origins (comma-separated); WebAuthn may accept several (web + native app)
function getExpectedOrigins(): string[] {
  const raw = process.env.WEBAUTHN_ORIGIN;
  if (!raw) throw new Error('WEBAUTHN_ORIGIN is not configured');
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

async function saveChallenge(
  userId: string,
  challenge: string,
  type: 'registration' | 'authentication',
): Promise<void> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.webAuthnChallenge.upsert({
    where: { userId },
    create: { userId, challenge, type, expiresAt },
    update: { challenge, type, expiresAt },
  });
}

async function consumeChallenge(
  userId: string,
  type: 'registration' | 'authentication',
): Promise<string> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { userId } });
  if (!row || row.type !== type) {
    throw new Error('No active challenge. Request a new challenge first.');
  }
  if (row.expiresAt < new Date()) {
    await prisma.webAuthnChallenge.delete({ where: { userId } }).catch(() => undefined);
    throw new Error('Challenge has expired. Request a new challenge first.');
  }
  // one-time use
  await prisma.webAuthnChallenge.delete({ where: { userId } }).catch(() => undefined);
  return row.challenge;
}

// ── Status ──────────────────────────────────────────────────────────────────
export async function getStatus(userId: string): Promise<{ registered: boolean }> {
  const count = await prisma.passkeyCredential.count({ where: { userId } });
  return { registered: count > 0 };
}

// ── Management (list / revoke) ─────────────────────────────────────────────

export interface PasskeySummary {
  id: string;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** List the user's registered passkeys (omits publicKey / encryptedDek). */
export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
  const creds = await prisma.passkeyCredential.findMany({
    where: { userId },
    select: {
      id: true,
      deviceType: true,
      backedUp: true,
      transports: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return creds.map((c) => ({
    id: c.id,
    deviceType: c.deviceType,
    backedUp: c.backedUp,
    transports: c.transports as string[],
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
  }));
}

/** Passkey not found (or not owned by this user). */
export class PasskeyNotFoundError extends Error {
  constructor() {
    super('Passkey not found for this account');
    this.name = 'PasskeyNotFoundError';
  }
}

/** Attempted to delete the last passkey (would permanently lock E2EE data). */
export class LastPasskeyError extends Error {
  constructor() {
    super('Cannot remove the last passkey. Register a new passkey before removing this one.');
    this.name = 'LastPasskeyError';
  }
}

/**
 * Revoke a passkey by PasskeyCredential.id.
 *
 * Guard: the last passkey cannot be deleted — that would permanently lock the
 * E2EE data layer. To replace a passkey: register the new one first (client
 * re-wraps the same DEK with the new PRF), then call this endpoint to delete the old.
 */
export async function deletePasskey(
  userId: string,
  credentialDbId: string,
): Promise<{ deleted: true }> {
  const cred = await prisma.passkeyCredential.findUnique({
    where: { id: credentialDbId },
    select: { id: true, userId: true },
  });
  if (!cred || cred.userId !== userId) {
    throw new PasskeyNotFoundError();
  }

  const count = await prisma.passkeyCredential.count({ where: { userId } });
  if (count <= 1) {
    throw new LastPasskeyError();
  }

  await prisma.passkeyCredential.delete({ where: { id: cred.id } });
  logBusinessEvent('passkey_revoked', userId, { credentialDbId });
  return { deleted: true };
}

// ── Registration ──────────────────────────────────────────────────────────────
export async function createRegistrationOptions(
  userId: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const [user, existing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, walletAddress: true },
    }),
    prisma.passkeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    }),
  ]);

  // WebAuthn userName is display-only; fallback email → wallet → userId
  const userName = user?.email || user?.name || user?.walletAddress || userId;

  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  await saveChallenge(userId, options.challenge, 'registration');
  return options;
}

export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  encryptedDek: string,
): Promise<{ verified: boolean }> {
  const expectedChallenge = await consumeChallenge(userId, 'registration');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getExpectedOrigins(),
    expectedRPID: getRpId(),
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await prisma.passkeyCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      transports: (credential.transports ?? []) as string[],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      encryptedDek,
    },
  });

  logBusinessEvent('passkey_registered', userId, { deviceType: credentialDeviceType });
  return { verified: true };
}

// ── Authentication ──────────────────────────────────────────────────────────
export async function createAuthenticationOptions(
  userId: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const credentials = await prisma.passkeyCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  if (credentials.length === 0) {
    throw new Error('No passkey registered for this account');
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: 'preferred',
  });

  await saveChallenge(userId, options.challenge, 'authentication');
  return options;
}

export async function verifyAuthentication(
  userId: string,
  response: AuthenticationResponseJSON,
): Promise<{ verified: boolean; encryptedDek: string | null }> {
  const expectedChallenge = await consumeChallenge(userId, 'authentication');

  const credential = await prisma.passkeyCredential.findUnique({
    where: { credentialId: response.id },
  });

  if (!credential || credential.userId !== userId) {
    throw new Error('Credential not found for this account');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getExpectedOrigins(),
    expectedRPID: getRpId(),
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    return { verified: false, encryptedDek: null };
  }

  // Update counter (anti-replay) + lastUsedAt
  await prisma.passkeyCredential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  appLogger.debug('Passkey authentication verified', { userId, credentialId: credential.id });
  return { verified: true, encryptedDek: credential.encryptedDek };
}
