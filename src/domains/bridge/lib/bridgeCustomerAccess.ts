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

/** 判斷 customer 是否至少有一個 approved 的 endorsement（可交易）。 */
export function canTransact(kycStatus: string, endorsements: BridgeEndorsement[]): boolean {
  if (!APPROVED_KYC_STATUSES.has(kycStatus)) return false;
  if (endorsements.length === 0) return true; // 沒回傳 endorsement 時以 KYC 狀態為準
  return endorsements.some((e) => e.status === 'approved');
}

/**
 * 判斷 Bridge 是否回報「資源不存在」（customer / kyc_link 已被刪除或 sandbox 重置）。
 * 偵測條件：HTTP 404 且 body 的 code === 'not_found'（message 常見為 "Customer not found"）。
 * 以 code 為主、message 為後備（較穩定）。
 */
export function isBridgeNotFound(error: unknown): boolean {
  if (!(error instanceof BridgeError) || error.statusCode !== 404) return false;
  try {
    const parsed = JSON.parse(error.bridgeBody) as { code?: string };
    if (parsed.code === 'not_found') return true;
  } catch {
    // body 非 JSON，落到 message 後備比對
  }
  return /not[_\s]?found|customer not found/i.test(error.bridgeBody);
}

/**
 * 清除本地失效的 Bridge customer 參照（Bridge 端已不存在時呼叫）。
 * 將 customer / kyc_link ids 與狀態歸零，讓下一次建立以「無 customer」乾淨開始。
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
 * 向 Bridge 設定 customer-named fiat payout（出金顯示用戶法定姓名）。
 * 目前僅 usd.wire 支援 customer；需 Bridge 帳戶開通 premium。
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

/** 取得已通過 KYC、可建立 transfer 的 bridgeCustomerId，否則丟出清楚錯誤。 */
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
 * 確認 customer 已具備「該入金幣別所需」且 approved 的 endorsement。
 *
 * 先向 Bridge 刷新最新狀態（避免本地 endorsements 過時），再判定。
 * 缺少時丟出結構化 409（code=endorsement_required），讓前端引導用戶
 * 透過 POST /api/bridge/endorsement-link 取得 hosted flow URL。
 */
export async function assertEndorsementForCurrency(
  userId: string,
  currency: string,
): Promise<void> {
  const required = resolveEndorsementForCurrency(currency);
  if (!required) return;

  // 向 Bridge 拉最新 customer 狀態（同時同步本地 endorsements）
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
 * 包裝會用到 bridgeCustomerId 的 Bridge 呼叫（transfer / external account）。
 * 若 Bridge 回報 customer 已不存在（404 not_found），清除 stale 參照並要求重新 KYC，
 * 與 kyc-link / customer 查詢採同一套自我修復邏輯，避免使用者卡關。
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

/** 僅回傳 ERC-4337 SCA（crypto-to-crypto 出金到 Base 用）。 */
export async function resolveUserScaAddress(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scaAddress: true },
  });
  return user?.scaAddress ?? null;
}
