/**
 * Customer access helpers: KYC gates, endorsements, stale-customer repair.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logError } from '../../logger';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeEndorsement,
  BridgeFiatPayoutConfiguration,
} from '../models/types';
import { CUSTOMER_NAMED_PAYOUT_CONFIGURATION } from '../models/types';
import { BridgeError, bridgeFetch } from './bridgeHttp';
import { resolveEndorsementForCurrency } from './bridgeEndorsement';

export const APPROVED_KYC_STATUSES = new Set(['approved', 'active']);

export function shouldUseCustomerNamedPayout(): boolean {
  return process.env.BRIDGE_CUSTOMER_NAMED_PAYOUT !== 'false';
}

/** True if KYC is approved and at least one endorsement is approved (or none returned). */
export function canTransact(kycStatus: string, endorsements: BridgeEndorsement[]): boolean {
  if (!APPROVED_KYC_STATUSES.has(kycStatus)) return false;
  if (endorsements.length === 0) return true; // no endorsements in response → trust KYC status
  return endorsements.some((e) => e.status === 'approved');
}

/**
 * Whether Bridge reported the resource as missing (customer/kyc_link deleted or sandbox reset).
 * Detects HTTP 404 with body code === 'not_found' (message often "Customer not found").
 * Prefer `code`; fall back to message matching.
 */
export function isBridgeNotFound(error: unknown): boolean {
  if (!(error instanceof BridgeError) || error.statusCode !== 404) return false;
  try {
    const parsed = JSON.parse(error.bridgeBody) as { code?: string };
    if (parsed.code === 'not_found') return true;
  } catch {
    // non-JSON body → fall back to message match
  }
  return /not[_\s]?found|customer not found/i.test(error.bridgeBody);
}

/**
 * Clear local Bridge customer refs when the remote customer no longer exists.
 * Resets ids/status so the next create starts with a clean "no customer" state.
 */
export async function clearStaleCustomer(userId: string): Promise<void> {
  await prisma.bridgeCustomer.update({
    where: { userId },
    data: {
      bridgeCustomerId: null,
      kycLinkId: null,
      kycLink: null,
      tosLink: null,
      kycStatus: 'not_started',
      tosStatus: 'pending',
      endorsements: Prisma.JsonNull,
      rejectionReasons: Prisma.JsonNull,
      customerNamedPayoutAt: null,
    },
  });
}

/**
 * Configure Bridge customer-named fiat payout (bank statement shows legal name).
 * Currently usd.wire only; requires Bridge account premium.
 * @see https://apidocs.bridge.xyz/platform/orchestration/more/fiat-payout-configuration
 */
export async function ensureCustomerNamedPayout(userId: string): Promise<void> {
  if (!shouldUseCustomerNamedPayout()) return;
  if (await DemoService.isDemoUser(userId)) return;

  const record = await prisma.bridgeCustomer.findUnique({
    where: { userId },
    select: {
      bridgeCustomerId: true,
      kycStatus: true,
      customerNamedPayoutAt: true,
    },
  });

  if (!record?.bridgeCustomerId || record.customerNamedPayoutAt) return;
  if (!APPROVED_KYC_STATUSES.has(record.kycStatus)) return;

  try {
    await bridgeFetch<BridgeFiatPayoutConfiguration>(
      `/customers/${record.bridgeCustomerId}/fiat_payout_configuration`,
      {
        method: 'PATCH',
        body: CUSTOMER_NAMED_PAYOUT_CONFIGURATION,
      },
    );

    await prisma.bridgeCustomer.update({
      where: { userId },
      data: { customerNamedPayoutAt: new Date() },
    });

    appLogger.info('[BridgeService] Customer named payout configured', {
      userId,
      bridgeCustomerId: record.bridgeCustomerId,
      configuration: CUSTOMER_NAMED_PAYOUT_CONFIGURATION,
    });
  } catch (error) {
    logError('[BridgeService] Failed to configure customer named payout', error as Error, {
      userId,
      bridgeCustomerId: record.bridgeCustomerId,
    });
  }
}

/** Return bridgeCustomerId if KYC-approved and ready to transact; otherwise throw. */
export async function requireTransactableCustomer(userId: string): Promise<string> {
  const record = await prisma.bridgeCustomer.findUnique({ where: { userId } });
  if (!record?.bridgeCustomerId) {
    throw new BridgeError(
      409,
      'Bridge customer not onboarded. Complete KYC before transacting.',
      'requireTransactableCustomer',
    );
  }
  if (!APPROVED_KYC_STATUSES.has(record.kycStatus)) {
    throw new BridgeError(
      409,
      `Bridge KYC not approved (status: ${record.kycStatus}).`,
      'requireTransactableCustomer',
    );
  }
  return record.bridgeCustomerId;
}

/**
 * Ensure the customer has an approved endorsement required for the deposit currency.
 *
 * Refreshes status from Bridge first (local endorsements may be stale).
 * On missing endorsement, throws structured 409 (code=endorsement_required) so the
 * client can open POST /api/bridge/endorsement-link for the hosted flow URL.
 */
export async function assertEndorsementForCurrency(
  userId: string,
  currency: string,
): Promise<void> {
  const required = resolveEndorsementForCurrency(currency);
  if (!required) return;

  // Refresh customer from Bridge (also syncs local endorsements)
  const { BridgeCustomerService } = await import('../services/bridgeCustomerService');
  const status = await BridgeCustomerService.getCustomerStatus(userId);
  const approved = status.endorsements.some(
    (e) => e.name === required && e.status === 'approved',
  );
  if (approved) return;

  throw new BridgeError(
    409,
    JSON.stringify({
      code: 'endorsement_required',
      endorsement: required,
      currency: currency.toLowerCase(),
      message:
        `${currency.toUpperCase()} deposits require the "${required}" endorsement. ` +
        `Call POST /api/bridge/endorsement-link with { "endorsement": "${required}" } ` +
        `and open the returned kycLink (usually just a ToS step if KYC is already approved).`,
    }),
    'assertEndorsementForCurrency',
  );
}

/**
 * Wrap Bridge calls that use bridgeCustomerId (transfer / external account).
 * On 404 not_found, clear stale refs and require re-KYC — same self-heal as kyc-link/customer.
 */
export async function withStaleCustomerGuard<T>(
  userId: string,
  path: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isBridgeNotFound(error)) throw error;

    appLogger.warn('[BridgeService] Stale Bridge customer during transaction, clearing', {
      userId,
      path,
    });
    await clearStaleCustomer(userId);

    throw new BridgeError(
      409,
      'Bridge customer no longer exists. Re-complete KYC before transacting.',
      path,
    );
  }
}

export async function resolveUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}

export async function resolveUserWalletAddress(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scaAddress: true, walletAddress: true },
  });
  return user?.scaAddress ?? user?.walletAddress ?? null;
}

/** ERC-4337 SCA only (crypto-to-crypto payouts to Base). */
export async function resolveUserScaAddress(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scaAddress: true },
  });
  return user?.scaAddress ?? null;
}
