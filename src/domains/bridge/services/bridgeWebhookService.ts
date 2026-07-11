/**
 * Bridge Webhook 簽章驗證與事件處理
 *
 * Bridge 以 RSA 簽署 webhook：
 *   Header:  X-Webhook-Signature: t=<timestampMs>,v0=<base64Signature>
 *   signed = "{t}.{rawBody}"，對其取 SHA256 後用 endpoint 公鑰（PEM）驗證 RSA 簽章。
 *
 * 防重放：拒絕 timestamp 早於 10 分鐘的事件。
 * 公鑰由 Bridge 在建立 webhook endpoint 時提供（PEM），存於 BRIDGE_WEBHOOK_PUBLIC_KEY。
 */

import crypto from 'crypto';
import { appLogger } from '../../logger';
import {
  BridgeService,
  recordWebhookEvent,
} from './bridgeService';
import type {
  BridgeCustomerResponse,
  BridgeKycLinkResponse,
  BridgeTransferResponse,
} from '../models/types';

const REPLAY_TOLERANCE_MS = 10 * 60 * 1000; // 10 分鐘

export interface BridgeWebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

function getWebhookPublicKey(): string | null {
  const key = process.env.BRIDGE_WEBHOOK_PUBLIC_KEY;
  if (!key) return null;
  // 支援以 \n 轉義方式儲存在環境變數的 PEM
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  // 格式：t=<ms>,v0=<base64>
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
 * 驗證 Bridge webhook 簽章。
 * @param rawBody 原始請求字串（驗章前未經 JSON.parse）
 * @param signatureHeader X-Webhook-Signature 值
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

  // 防重放：timestamp 為毫秒
  if (Math.abs(Date.now() - parsed.timestamp) > REPLAY_TOLERANCE_MS) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  try {
    const signedPayload = `${parsed.timestamp}.${rawBody}`;
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedPayload, 'utf8');
    verifier.end();
    const ok = verifier.verify(publicKey, parsed.signature, 'base64');
    return ok ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
  } catch (error) {
    appLogger.warn('[BridgeWebhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { valid: false, reason: 'verification_error' };
  }
}

// ── 事件處理 ──────────────────────────────────────────────────────────

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
      await BridgeService.syncTransferFromWebhook(obj as unknown as BridgeTransferResponse);
      break;
    case 'customer':
      await BridgeService.syncCustomerFromWebhook(obj as unknown as BridgeCustomerResponse);
      break;
    case 'kyc_link':
      await BridgeService.syncKycLinkFromWebhook(obj as unknown as BridgeKycLinkResponse);
      break;
    default:
      appLogger.info('[BridgeWebhook] Unhandled event category', {
        category: event.event_category,
        type: event.event_type,
      });
  }
}
