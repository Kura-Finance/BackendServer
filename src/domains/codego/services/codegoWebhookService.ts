/**
 * Codego webhook signature verification and event dispatch.
 *
 * Header: Signature: sha256=HMAC_SHA256(rawBody, secret)
 * Dedup:  Idempotency-Key
 * @see https://developers.codegotech.com/visa-crypto-card.html
 */

import crypto from 'crypto';
import { appLogger } from '../../logger';
import { CodegoService } from './codegoService';
import type { CodegoWebhookPayload } from '../models/types';

export interface CodegoWebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

function getWebhookSecret(): string | null {
  return process.env.CODEGO_WEBHOOK_SECRET ?? null;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): CodegoWebhookVerifyResult {
  const secret = getWebhookSecret();
  if (!secret) {
    return { valid: false, reason: 'webhook_secret_not_configured' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const expected =
    `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

  try {
    const provided = Buffer.from(signatureHeader, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
      return { valid: false, reason: 'signature_mismatch' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}

export async function handleWebhookEvent(
  event: CodegoWebhookPayload,
  idempotencyKey: string,
): Promise<void> {
  const isNew = await CodegoService.recordWebhookEvent(
    idempotencyKey,
    event.type,
    event,
  );

  if (!isNew) {
    appLogger.debug('[CodegoWebhook] Duplicate event, skipping', { idempotencyKey });
    return;
  }

  appLogger.info('[CodegoWebhook] Event received', {
    type: event.type,
    idempotencyKey,
  });

  const body = event.body ?? {};

  switch (event.type) {
    case 'user.updated':
      await CodegoService.syncUserFromWebhook(body);
      break;
    case 'company.updated':
      // KYB：同樣以 externalUserId 對應 Kura userId
      await CodegoService.syncUserFromWebhook(body);
      break;
    case 'card.created':
    case 'card.updated':
      await CodegoService.syncCardFromWebhook(body);
      break;
    default:
      appLogger.info('[CodegoWebhook] Unhandled event type', { type: event.type });
  }
}
