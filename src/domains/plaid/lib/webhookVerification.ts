/**
 * Verify Plaid webhook JWT (Plaid-Verification header) and body hash.
 */
import * as crypto from 'crypto';
import { Request } from 'express';
import { decodeProtectedHeader, importJWK, jwtVerify, JWTPayload, JWK } from 'jose';
import { createPlaidWebhookClient } from './plaidClientFactory';
import { logDebug, logError } from '../../logger';

type PlaidWebhookJwtPayload = JWTPayload & {
  request_body_sha256?: string;
};

type PlaidVerificationResult = {
  isValid: boolean;
  reason?: string;
};

const plaidVerificationKeyCache = new Map<string, JWK>();

function getPlaidVerificationHeader(req: Request): string | null {
  const header = req.headers['plaid-verification'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header) && header.length > 0) return header[0] || null;
  return null;
}

function hashRequestBody(body: unknown): string {
  const canonicalBody =
    typeof body === 'string'
      ? body
      : JSON.stringify(body ?? {}, null, 2);

  return crypto.createHash('sha256').update(canonicalBody, 'utf8').digest('hex');
}

function timingSafeHexEqual(actualHex: string, expectedHex: string): boolean {
  if (actualHex.length !== expectedHex.length) return false;
  const actual = Buffer.from(actualHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

async function getPlaidJwkByKeyId(keyId: string): Promise<JWK> {
  const cached = plaidVerificationKeyCache.get(keyId);
  if (cached) return cached;

  const plaidClient = createPlaidWebhookClient();
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const key = response.data?.key as unknown as JWK | undefined;
  if (!key) {
    throw new Error('Plaid webhook verification key not found');
  }

  plaidVerificationKeyCache.set(keyId, key);
  return key;
}

/** Validate Plaid-Verification JWT and request body SHA-256. */
export async function verifyPlaidWebhook(req: Request): Promise<PlaidVerificationResult> {
  const signedJwt = getPlaidVerificationHeader(req);
  if (!signedJwt) {
    return { isValid: false, reason: 'Missing Plaid-Verification header' };
  }

  try {
    const protectedHeader = decodeProtectedHeader(signedJwt);
    const keyId = protectedHeader.kid;
    if (!keyId) {
      return { isValid: false, reason: 'Missing kid in Plaid-Verification JWT header' };
    }

    const jwk = await getPlaidJwkByKeyId(keyId);
    const keyLike = await importJWK(jwk);
    const { payload } = await jwtVerify(signedJwt, keyLike, {
      maxTokenAge: '5 min',
    });

    const verifiedPayload = payload as PlaidWebhookJwtPayload;
    if (!verifiedPayload.request_body_sha256 || !/^[a-f0-9]{64}$/i.test(verifiedPayload.request_body_sha256)) {
      return { isValid: false, reason: 'Invalid request_body_sha256 in Plaid-Verification payload' };
    }

    const bodyHash = hashRequestBody(req.body);
    const claimedBodyHash = verifiedPayload.request_body_sha256.toLowerCase();
    if (!timingSafeHexEqual(bodyHash, claimedBodyHash)) {
      return { isValid: false, reason: 'Webhook body hash mismatch' };
    }

    return { isValid: true };
  } catch (error) {
    logError('Plaid webhook verification failed', error);
    return { isValid: false, reason: 'Invalid Plaid webhook signature' };
  }
}

/** Clear cached Plaid JWKs (tests / key rotation). */
export function clearPlaidWebhookVerificationKeyCache(): void {
  plaidVerificationKeyCache.clear();
  logDebug('Cleared Plaid webhook verification key cache');
}
