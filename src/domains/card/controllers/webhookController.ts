/**
 * Gnosis Pay Webhook Controller
 *
 * POST /api/card/webhooks/gp
 *
 * GP signs requests with Ed25519:
 *   headers: X-Webhook-Timestamp, X-Webhook-Signature
 *   signed payload: "{timestamp}.{rawBody}"
 */

import { Request, Response } from 'express';
import { verifyWebhookSignature, handleWebhookEvent } from '../services/gnosisPayWebhookService';
import { appLogger } from '../../logger';

export async function handleGnosisPayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  const timestamp = req.headers['x-webhook-timestamp'] as string | undefined;
  const rawBody: string = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!signature || !timestamp) {
    appLogger.warn('[GPWebhook] Missing signature headers');
    res.status(400).json({ error: 'Missing signature headers' });
    return;
  }

  const isValid = await verifyWebhookSignature(rawBody, signature, timestamp);
  if (!isValid) {
    appLogger.warn('[GPWebhook] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Timestamp replay protection (±5 min)
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) {
    appLogger.warn('[GPWebhook] Stale timestamp', { timestamp });
    res.status(400).json({ error: 'Stale timestamp' });
    return;
  }

  // Acknowledge immediately; process async
  res.status(200).json({ ok: true });

  try {
    await handleWebhookEvent(req.body);
  } catch (err) {
    appLogger.error('[GPWebhook] Event processing error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
