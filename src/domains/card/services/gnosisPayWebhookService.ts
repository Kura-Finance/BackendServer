/**
 * Gnosis Pay Webhook Verification & Handlers
 *
 * GP signs webhooks with Ed25519:
 *   signedData = "{X-Webhook-Timestamp}.{rawBody}"
 *   X-Webhook-Signature = base64(ed25519Sign(signedData))
 *
 * Public key fetched from: https://webhooks.gnosispay.com/api/v1/public-key
 * Key is cached in-memory; refreshed on verification failure.
 */

import crypto from 'crypto';
import { prisma } from '../../shared/lib/database';
import { appLogger } from '../../logger';

const GP_WEBHOOK_PUBKEY_URL = 'https://webhooks.gnosispay.com/api/v1/public-key';

let _cachedPubKey: crypto.KeyObject | null = null;
let _pubKeyCachedAt = 0;
const PUBKEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchWebhookPublicKey(): Promise<crypto.KeyObject> {
  const now = Date.now();
  if (_cachedPubKey && now - _pubKeyCachedAt < PUBKEY_CACHE_TTL_MS) {
    return _cachedPubKey;
  }

  const res = await fetch(GP_WEBHOOK_PUBKEY_URL);
  if (!res.ok) throw new Error(`Failed to fetch GP webhook public key: ${res.status}`);

  const body = await res.json() as { publicKey: string } | string;
  const rawKey = typeof body === 'string' ? body : (body as { publicKey: string }).publicKey;

  // GP returns base64-encoded raw Ed25519 public key (32 bytes)
  const keyBytes = Buffer.from(rawKey, 'base64');
  _cachedPubKey = crypto.createPublicKey({
    key: keyBytes,
    format: 'der',
    type: 'spki',
  });
  _pubKeyCachedAt = now;
  return _cachedPubKey;
}

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const pubKey = await fetchWebhookPublicKey();
    const signedData = Buffer.from(`${timestamp}.${rawBody}`, 'utf8');
    const sigBytes = Buffer.from(signature, 'base64');
    return crypto.verify(null, signedData, pubKey, sigBytes);
  } catch (err) {
    // If key fetch failed, bust cache and try once more
    _cachedPubKey = null;
    appLogger.warn('[GPWebhook] Signature verification error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Event handlers ───────────────────────────────────────────────────────────

export interface GpWebhookPayload {
  eventType: string;
  data: Record<string, unknown>;
}

export async function handleWebhookEvent(payload: GpWebhookPayload): Promise<void> {
  const { eventType, data } = payload;
  appLogger.info('[GPWebhook] Event received', { eventType });

  switch (eventType) {
    case 'kyc.status.changed':
      await handleKycStatusChanged(data);
      break;
    case 'card.transaction.created':
    case 'card.transaction.confirmed':
    case 'card.transaction.cleared':
    case 'card.transaction.declined':
    case 'card.transaction.reversed':
    case 'card.transaction.refunded':
      await handleTransactionEvent(eventType, data);
      break;
    case 'virtual.card.issued':
    case 'card.status.changed':
      await handleCardStatusChanged(data);
      break;
    case 'safe.created':
    case 'safe.modules.deployed':
      await handleSafeEvent(data);
      break;
    default:
      appLogger.info('[GPWebhook] Unhandled event type', { eventType });
  }
}

async function handleKycStatusChanged(data: Record<string, unknown>): Promise<void> {
  // GP includes full user data in webhook; match by safe address or userId
  const safeAddress = data.safeAddress as string | undefined;
  const kycStatus = data.kycStatus as string | undefined;
  if (!safeAddress || !kycStatus) return;

  const wallet = await prisma.cardWallet.findFirst({ where: { gpSafeAddress: safeAddress } });
  if (!wallet) {
    appLogger.warn('[GPWebhook] KYC event: no wallet found for safe', { safeAddress });
    return;
  }

  await prisma.cardWallet.update({
    where: { id: wallet.id },
    data: { gpKycStatus: kycStatus },
  });

  // Sync to CardKycApplication
  const mappedStatus = GP_KYC_STATUS_MAP[kycStatus] ?? 'pending';
  await prisma.cardKycApplication.updateMany({
    where: { userId: wallet.userId },
    data: {
      status: mappedStatus,
      ...(mappedStatus === 'approved' ? { reviewedAt: new Date() } : {}),
    },
  });

  appLogger.info('[GPWebhook] KYC status updated', { userId: wallet.userId, kycStatus, mappedStatus });
}

async function handleTransactionEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const event = data.event as Record<string, unknown> | undefined;
  if (!event) return;

  const txId = event.id as string | undefined;
  const safeAddresses = (data.safeWallets as string[] | undefined) ?? [];
  const merchantName = (event.merchant as Record<string, unknown> | undefined)?.name as string | undefined;
  const merchantCategory = (event.merchant as Record<string, unknown> | undefined)?.category as string | undefined;
  const amount = event.billingAmount as number | undefined;
  const currency = (event.billingCurrency as string | undefined) ?? 'EURe';
  const kind = (event.kind as string | undefined) ?? 'Payment';
  const isPending = !!(event.isPending);
  const status = deriveTransactionStatus(eventType, event);
  const onChainTxs = event.transactions as Array<Record<string, unknown>> | undefined;
  const txHash = onChainTxs?.[0]?.hash as string | undefined;

  if (!txId) return;

  // Find user by Safe address
  const wallet = safeAddresses.length > 0
    ? await prisma.cardWallet.findFirst({ where: { gpSafeAddress: { in: safeAddresses } } })
    : null;
  if (!wallet) return;

  const cardAccount = await prisma.cardAccount.findFirst({
    where: { userId: wallet.userId },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!cardAccount) return;

  await prisma.cardTransaction.upsert({
    where: { providerEventId: txId },
    create: {
      userId: wallet.userId,
      cardAccountId: cardAccount.id,
      providerEventId: txId,
      amount: amount ?? 0,
      currency,
      merchantName: merchantName ?? null,
      merchantCategory: merchantCategory ?? null,
      kind,
      isPending,
      status,
      txHash: txHash ?? null,
      authorizedAt: new Date(),
      ...(status === 'cleared' ? { clearedAt: new Date() } : {}),
    },
    update: {
      status,
      isPending,
      txHash: txHash ?? null,
      ...(status === 'cleared' ? { clearedAt: new Date() } : {}),
      ...(status === 'reversed' ? { reversedAt: new Date() } : {}),
    },
  });

  appLogger.info('[GPWebhook] Transaction upserted', { txId, status, userId: wallet.userId });

  if (status === 'cleared' && txId) {
    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromCardTransaction({
      userId: wallet.userId,
      providerEventId: txId,
      amount: amount ?? 0,
      currency,
      status,
      authorizedAt: new Date(),
    }).catch((err) => {
      appLogger.error('[GPWebhook] Failed to record platform revenue from card tx', {
        txId,
        userId: wallet.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

async function handleCardStatusChanged(data: Record<string, unknown>): Promise<void> {
  const cardId = data.id as string | undefined;
  const status = data.status as string | undefined;
  if (!cardId || !status) return;

  await prisma.cardAccount.updateMany({
    where: { providerCardId: cardId },
    data: {
      status: GP_CARD_STATUS_MAP[status] ?? status,
      ...(status === 'frozen' ? { frozenAt: new Date() } : {}),
      ...(status === 'active' ? { frozenAt: null } : {}),
    },
  });
}

async function handleSafeEvent(data: Record<string, unknown>): Promise<void> {
  const safeAddress = data.safeAddress as string | undefined;
  const accountStatus = data.accountStatus as number | undefined;
  if (!safeAddress) return;

  await prisma.cardWallet.updateMany({
    where: { gpSafeAddress: safeAddress },
    data: { gpAccountStatus: accountStatus ?? null },
  });
}

// ── Status mappings ──────────────────────────────────────────────────────────

const GP_KYC_STATUS_MAP: Record<string, string> = {
  notStarted:             'not_started',
  documentsRequested:     'pending',
  pending:                'pending',
  processing:             'pending',
  approved:               'approved',
  resubmissionRequested:  'pending',
  rejected:               'rejected',
  requiresAction:         'under_review',
};

const GP_CARD_STATUS_MAP: Record<string, string> = {
  active:    'active',
  frozen:    'frozen',
  cancelled: 'cancelled',
};

function deriveTransactionStatus(eventType: string, event: Record<string, unknown>): string {
  switch (eventType) {
    case 'card.transaction.cleared':   return 'cleared';
    case 'card.transaction.declined':  return 'declined';
    case 'card.transaction.reversed':  return 'reversed';
    case 'card.transaction.refunded':  return 'refunded';
    case 'card.transaction.created':
    case 'card.transaction.confirmed':
    default: {
      const raw = event.status as string | undefined;
      return raw?.toLowerCase() ?? 'authorized';
    }
  }
}
