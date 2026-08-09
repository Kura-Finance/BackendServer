/**
 * Bridge webhook signature verification and event handling.
 *
 * Bridge signs with RSA:
 *   Header:  X-Webhook-Signature: t=<timestampMs>,v0=<base64Signature>
 *   signed = "{t}.{rawBody}"
 *   digest = SHA256(signed) → verify digest with RSA-SHA256 (double SHA256; see Bridge Node/Go samples)
 *
 * Replay protection: reject events whose timestamp is older than 10 minutes.
 * Public key (PEM) is provided when creating the webhook endpoint; stored as BRIDGE_WEBHOOK_PUBLIC_KEY.
 */

import crypto from 'crypto';
import { appLogger } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import {
  BridgeService,
  recordWebhookEvent,
} from './bridgeService';
import type {
  BridgeCustomerResponse,
  BridgeDrainResponse,
  BridgeKycLinkResponse,
  BridgeTransferResponse,
  BridgeVirtualAccountEventResponse,
} from '../models/types';

const REPLAY_TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes

export interface BridgeWebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

/** Normalize PEM from env (secret stores often flatten newlines to `\n`). */
function getWebhookPublicKey(): string | null {
  const raw = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY?.trim();
  if (!raw) return null;
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  // Format: t=<ms>,v0=<base64>
  const parts = header.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    if (key === 't') timestamp = Number(value);
    else if (key === 'v0') signature = value;
  }
  if (timestamp === null || !Number.isFinite(timestamp) || !signature) return null;
  return { timestamp, signature };
}

/**
 * Verify Bridge webhook signature.
 * @param rawBody Raw request body string (before JSON.parse)
 * @param signatureHeader X-Webhook-Signature header value
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): BridgeWebhookVerifyResult {
  const publicKey = getWebhookPublicKey();
  if (!publicKey) {
    return { valid: false, reason: 'webhook_public_key_not_configured' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return { valid: false, reason: 'malformed_signature_header' };
  }

  // Replay check: timestamp is milliseconds
  if (Math.abs(Date.now() - parsed.timestamp) > REPLAY_TOLERANCE_MS) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  try {
    // Bridge signs SHA256(SHA256("{t}.{rawBody}")) via RSA-PKCS1v15 — not a single SHA256.
    // Matches Bridge docs Node sample: createHash → createVerify('RSA-SHA256').update(digest).
    const signedPayload = `${parsed.timestamp}.${rawBody}`;
    const digest = crypto.createHash('sha256').update(signedPayload, 'utf8').digest();
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(digest);
    const ok = verifier.verify(publicKey, parsed.signature, 'base64');
    return ok ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
  } catch (error) {
    appLogger.warn('[BridgeWebhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { valid: false, reason: 'verification_error' };
  }
}

// ── Event handling ──────────────────────────────────────────────────

export interface BridgeWebhookEvent {
  api_version?: string;
  event_id: string;
  event_category: string;
  event_type: string;
  event_object_id?: string;
  event_object_status?: string;
  event_object?: Record<string, unknown>;
  event_object_changes?: Record<string, unknown>;
  event_created_at?: string;
}

export async function handleWebhookEvent(event: BridgeWebhookEvent): Promise<void> {
  if (!event.event_id) {
    appLogger.warn('[BridgeWebhook] Event missing event_id, skipping');
    return;
  }

  const isNew = await recordWebhookEvent(
    event.event_id,
    event.event_category,
    event.event_type,
    event.event_object ?? {},
  );

  if (!isNew) {
    appLogger.debug('[BridgeWebhook] Duplicate event, skipping', { eventId: event.event_id });
    return;
  }

  appLogger.info('[BridgeWebhook] Event received', {
    eventId: event.event_id,
    category: event.event_category,
    type: event.event_type,
  });

  const obj = event.event_object ?? {};

  switch (event.event_category) {
    case 'transfer':
      await BridgeService.syncTransferFromWebhook(obj as unknown as BridgeTransferResponse, {
        webhookEventId: event.event_id,
      });
      break;
    case 'customer':
      await BridgeService.syncCustomerFromWebhook(obj as unknown as BridgeCustomerResponse);
      break;
    case 'kyc_link':
      await BridgeService.syncKycLinkFromWebhook(obj as unknown as BridgeKycLinkResponse);
      break;
    case 'virtual_account.activity':
      await BridgeService.syncVirtualAccountActivity(
        obj as unknown as BridgeVirtualAccountEventResponse,
        { webhookEventId: event.event_id },
      );
      break;
    case 'liquidation_address.drain':
      await BridgeService.syncLiquidationDrainFromWebhook(obj as unknown as BridgeDrainResponse, {
        webhookEventId: event.event_id,
      });
      break;
    default:
      appLogger.info('[BridgeWebhook] Unhandled event category', {
        category: event.event_category,
        type: event.event_type,
      });
  }

  await ReferralCashbackService.settlePending();
}
