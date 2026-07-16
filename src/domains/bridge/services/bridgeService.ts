/**
 * Bridge (api.bridge.xyz) On/Off Ramp Service
 *
 * Auth:  `Api-Key: <BRIDGE_API_KEY>` header.
 * POST 一律需要 `Idempotency-Key`（24h 內相同 key 回傳相同結果）。
 *
 * 流程：
 *   1. 建立 KYC link  → POST /v0/kyc_links（hosted KYC + TOS）
 *   2. 用戶完成 KYC   → 由 webhook / 輪詢更新 kycStatus
 *   3. on-ramp        → POST /v0/transfers  (source=fiat, destination=crypto)
 *   4. off-ramp        → POST /v0/customers/{id}/liquidation_addresses (Base USDC → fiat)
 *   5. crypto deposit    → POST /v0/customers/{id}/liquidation_addresses (Tron USDT → Base USDC)
 *
 * Base: https://api.bridge.xyz/v0
 */

import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import {
  getBridgeDepositsPendingSyncMinIntervalMs,
  getBridgeDepositsSyncMinIntervalMs,
  isWithinInterval,
} from '../../shared/lib/lazyUpdate';
import { appLogger, logDebug, logError } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeCustomerResponse,
  BridgeCustomerType,
  BridgeEndorsement,
  BridgeEndorsementType,
  BridgeExternalAccountResponse,
  BridgeFeeConfig,
  BridgeKycLinkResponse,
  BridgeRejectionReason,
  BridgeRejectionReasonPublic,
  BridgeTransferResponse,
  BridgeVirtualAccountEventResponse,
  BridgeVirtualAccountHistoryResponse,
  BridgeVirtualAccountResponse,
  CreateKycLinkParams,
  CreateVirtualAccountParams,
  CreateLiquidationAddressParams,
  CreatePayoutAddressParams,
  CustomerStatusResult,
  EndorsementLinkResult,
  DepositResult,
  ExternalAccountResult,
  KycLinkResult,
  LiquidationAddressResult,
  TransferResult,
  VirtualAccountResult,
  BridgeLiquidationAddressResponse,
  BridgeLiquidationAddressListResponse,
  PayoutOption,
  PayoutLiquidationAddressResult,
  PayoutDrainResult,
  BridgeDrainListResponse,
  BridgeDrainResponse,
  BridgeFiatPayoutConfiguration,
  DepositEvent,
  DepositPayerInfo,
} from '../models/types';
import {
  CUSTOMER_NAMED_PAYOUT_CONFIGURATION,
  EMPTY_DEPOSIT_PAYER,
  LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  PAYOUT_OPTION_BASES,
  PAYOUT_LIQUIDATION_SOURCE,
  parseDepositPayerSource,
  resolveOnRampMinDeposit,
  resolvePayoutMinDeposit,
  resolveTronUsdtMinDeposit,
} from '../models/types';

const DEFAULT_BRIDGE_API = 'https://api.bridge.xyz/v0';
const VA_HISTORY_PAGE_LIMIT = 100;

function bridgeApiBase(): string {
  return (process.env.BRIDGE_API_URL || DEFAULT_BRIDGE_API).replace(/\/+$/, '');
}

function getApiKey(): string {
  const key = process.env.BRIDGE_API_KEY;
  if (!key) {
    throw new BridgeError(500, 'BRIDGE_API_KEY is not configured', 'config');
  }
  return key;
}

export interface BridgeStructuredErrorBody {
  code?: string;
  endorsement?: string;
  currency?: string;
  message?: string;
}

export class BridgeError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly bridgeBody: string,
    public readonly path: string,
  ) {
    super(`Bridge API error ${statusCode} on ${path}: ${bridgeBody}`);
    this.name = 'BridgeError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get structuredBody(): BridgeStructuredErrorBody | null {
    try {
      return JSON.parse(this.bridgeBody) as BridgeStructuredErrorBody;
    } catch {
      return null;
    }
  }
}

async function parseBridgeResponse<T>(res: globalThis.Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

interface BridgeFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

async function bridgeFetch<T>(path: string, options: BridgeFetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'Api-Key': getApiKey(),
    Accept: 'application/json',
  };

  // 僅 POST 需要 Idempotency-Key（GET/PUT/PATCH/DELETE 不可帶）
  if (method === 'POST') {
    headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${bridgeApiBase()}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new BridgeError(res.status, body, path);
  }
  return parseBridgeResponse<T>(res);
}

// ── 內部 helpers ──────────────────────────────────────────────────────

const APPROVED_KYC_STATUSES = new Set(['approved', 'active']);
const BRIDGE_TRANSFER_REVERSAL_STATES = new Set(['refunded', 'returned']);
const BRIDGE_DRAIN_REVERSAL_STATES = new Set(['refunded', 'returned']);

export interface BridgeWebhookSyncContext {
  webhookEventId?: string;
}

// 入金 / 出金法幣幣別 → 需要的 Bridge endorsement（rail 權限）。
// 這些全是 API 驅動：用 POST /endorsement-link 或 GET /customers/{id}/kyc_link?endorsement=... 申請。
//   usd  → base（KYC 通過預設具備，無需額外 hosted flow）
//   gbp  → faster_payments；eur → sepa；mxn → spei
//   brl  → pix；cop → cop
export const CURRENCY_ENDORSEMENT: Record<string, BridgeEndorsementType> = {
  usd: 'base',
  gbp: 'faster_payments',
  eur: 'sepa',
  mxn: 'spei',
  brl: 'pix',
  cop: 'cop',
};

/** 依法幣幣別解析所需 endorsement；usd/base 回傳 null（不需額外申請）。 */
export function resolveEndorsementForCurrency(currency: string): BridgeEndorsementType | null {
  const endorsement = CURRENCY_ENDORSEMENT[currency.toLowerCase()];
  if (!endorsement || endorsement === 'base') return null;
  return endorsement;
}

// ── 費率設計：保證不虧本 ────────────────────────────────────────────────
//
// 核心原則：向用戶收的 developer fee 必須 ≥ Bridge 向「平台」收的批發成本，
// 否則每筆都在貼錢。費率一律由後端決定（不接受 client 指定），避免被改成 0。
//
// Bridge 向平台收的批發成本（2026 報價）：
//   - On-ramp（VA）：0.50% of volume
//   - Off-ramp（transfer）：0.25% of volume
//   - FX all-in：USD<>EUR 0.50%、USD<>MXN 0.50%、USD<>BRL 0.55%
//   - USDT 支援：+0.10%
//   - 固定費：$2 / VA / month active、$2 KYC、$10 KYB、$0.25 / wallet / month
//   - 第三方費（ACH / wire / gas）：pass-through
//
// 註：百分比固定費（$2/VA、$2 KYC 等）無法用百分比 fee 完全回收，小額入金仍會被
// 固定費吃掉 margin。fee_config 路徑會帶 minimum_fee 設下限；developer_fee_percent
// 路徑無法設下限（Bridge 限制），固定費由整體 margin 吸收。

// 平台 margin（疊加在 Bridge 批發成本之上，base 100：'0.25' = 0.25%）。
const PLATFORM_MARGIN_PERCENT = 0.25;

// USDT 目的幣的額外批發成本，直通給用戶（不另加 margin）。
const USDT_SURCHARGE_PERCENT = 0.1;

// 每筆 off-ramp 最低 fee（USD 計），避免極小額轉帳的 fee 被四捨五入吃掉。
const OFFRAMP_MIN_FEE = 0.5;

// Crypto liquidation address 批發成本（base 100，保守估計跨鏈 + 換匯）。
const CRYPTO_LIQUIDATION_WHOLESALE_PERCENT = 0.25;

// Bridge 向平台收的 on-ramp 批發成本（含 FX，base 100）。
const ONRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.5, // onramp 0.50%
  gbp: 0.5, // onramp 0.50%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // USD<>COP FX all-in
};

// Bridge 向平台收的 off-ramp 批發成本（依目的法幣，含 FX，base 100）。
const OFFRAMP_WHOLESALE_PERCENT: Record<string, number> = {
  usd: 0.25, // offramp 0.25%
  gbp: 0.25, // offramp 0.25%
  eur: 0.5, // USD<>EUR FX all-in
  mxn: 0.5, // USD<>MXN FX all-in
  brl: 0.55, // USD<>BRL FX all-in
  cop: 0.5, // 未報價，保守 buffer
};

const OFFRAMP_RAIL_CURRENCY: Record<string, string> = {
  ach: 'usd',
  ach_push: 'usd',
  ach_same_day: 'usd',
  wire: 'usd',
  sepa: 'eur',
  faster_payments: 'gbp',
  pix: 'brl',
  spei: 'mxn',
  bre_b: 'cop',
  co_bank_transfer: 'cop',
};

function assertOffRampRailCurrency(destinationRail: string, destinationCurrency: string): void {
  const expected = OFFRAMP_RAIL_CURRENCY[destinationRail.toLowerCase()];
  if (!expected || expected === destinationCurrency.toLowerCase()) return;
  throw new BridgeError(
    400,
    `destinationRail "${destinationRail}" requires destinationCurrency "${expected}".`,
    'assertOffRampRailCurrency',
  );
}

/** 向上取兩位小數，確保收的 fee 不低於成本（不虧本）。 */
function ceil2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

/** decimal string 去除尾端多餘 0（"0.500" → "0.5"，"1.000" → "1"）。 */
function trimDecimal(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** 入金費率 = 批發成本 + margin（+ USDT surcharge），向上取兩位小數。 */
function onRampFeePercent(sourceCurrency: string, destinationCurrency: string): string | null {
  const wholesale = ONRAMP_WHOLESALE_PERCENT[sourceCurrency.toLowerCase()];
  if (wholesale === undefined) return null;
  const surcharge = destinationCurrency.toLowerCase() === 'usdt' ? USDT_SURCHARGE_PERCENT : 0;
  return ceil2(wholesale + PLATFORM_MARGIN_PERCENT + surcharge).toFixed(2);
}

// 之後若向 Bridge 申請開通 fee_config Beta，可改用 per-rail 的固定費 + 百分比
// （例如 USD 的 Fedwire 第三方固定費）。設 BRIDGE_FEE_CONFIG_ENABLED=true 啟用。
function buildFeeConfig(feePercent: string): BridgeFeeConfig {
  return {
    source: {
      // minimum_fee 確保小額入金仍能覆蓋 Bridge 固定費（$2/VA、$2 KYC）的一部分。
      default: { fee_percent: feePercent, minimum_fee: '2.00' },
    },
  };
}

function isFeeConfigEnabled(): boolean {
  return process.env.BRIDGE_FEE_CONFIG_ENABLED === 'true';
}

/**
 * 依入金幣別 + 目的幣組出要送給 Bridge 的費用欄位。
 * - BRIDGE_FEE_CONFIG_ENABLED=true → 回傳 { fee_config }（含 minimum_fee 下限）
 * - 否則 → 回傳 { developer_fee_percent }
 * - 無對應費率設定 → 回傳 {}（不收費，理論上不會發生：幣別由 schema enum 限制）
 * fee_config 與 developer_fee_percent 互斥，只會回傳其中一個。
 */
function buildVirtualAccountFeeBody(
  sourceCurrency: string,
  destinationCurrency: string,
): { fee_config: BridgeFeeConfig } | { developer_fee_percent: string } | Record<string, never> {
  const percent = onRampFeePercent(sourceCurrency, destinationCurrency);
  if (!percent) return {};
  if (isFeeConfigEnabled()) return { fee_config: buildFeeConfig(percent) };
  return { developer_fee_percent: percent };
}

/**
 * 計算 off-ramp 要送給 Bridge 的 developer_fee（絕對金額，以 source 穩定幣計）。
 * = max(amount × (批發成本 + margin)%, OFFRAMP_MIN_FEE)，向上取 2 位小數。
 * 一律由後端計算，不接受 client 指定，避免被設成 0。
 */
function computeOffRampDeveloperFee(amount: string, destinationCurrency: string): string {
  const amt = Number(amount);
  const wholesale = OFFRAMP_WHOLESALE_PERCENT[destinationCurrency.toLowerCase()] ?? 0.25;
  if (!Number.isFinite(amt) || amt <= 0) return trimDecimal(OFFRAMP_MIN_FEE.toFixed(2));
  const pctFee = ceil2((amt * (wholesale + PLATFORM_MARGIN_PERCENT)) / 100);
  // fee 不可超過轉帳本金（理論上不會發生，極小額時 minimum_fee 仍可能逼近本金）。
  const fee = Math.min(Math.max(pctFee, OFFRAMP_MIN_FEE), amt);
  return trimDecimal(fee.toFixed(2));
}

/** Liquidation Address 的 custom_developer_fee_percent（base 100，含 USDT surcharge）。 */
function cryptoLiquidationFeePercent(): string {
  return ceil2(
    CRYPTO_LIQUIDATION_WHOLESALE_PERCENT + PLATFORM_MARGIN_PERCENT,
  ).toFixed(2);
}

/** Payout LA 的 custom_developer_fee_percent（base 100，依目的法幣批發 + margin）。 */
function payoutLiquidationFeePercent(destinationCurrency: string): string {
  const wholesale = OFFRAMP_WHOLESALE_PERCENT[destinationCurrency.toLowerCase()] ?? 0.25;
  return ceil2(wholesale + PLATFORM_MARGIN_PERCENT).toFixed(2);
}

function buildPayoutDeveloperFee(
  developerFeePercent: string | null,
  destinationCurrency: string,
): { developerFeePercent: string; feeCurrency: string } {
  const fallback = payoutLiquidationFeePercent(destinationCurrency);
  return {
    developerFeePercent: developerFeePercent ?? fallback,
    feeCurrency: PAYOUT_LIQUIDATION_SOURCE.sourceCurrency,
  };
}

function buildDepositDeveloperFee(
  feeCurrency: string,
  developerFeePercent: string | null,
  fallbackPercent: string,
): { developerFeePercent: string; feeCurrency: string } {
  return {
    developerFeePercent: developerFeePercent ?? fallbackPercent,
    feeCurrency: feeCurrency.toLowerCase(),
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** 正規化 Bridge rejection_reasons；無效項目略過。 */
function normalizeRejectionReasons(raw: unknown): BridgeRejectionReason[] {
  if (!Array.isArray(raw)) return [];
  const out: BridgeRejectionReason[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    const developerReason =
      typeof row.developer_reason === 'string' ? row.developer_reason.trim() : undefined;
    if (!reason && !developerReason) continue;
    out.push({
      ...(developerReason ? { developer_reason: developerReason } : {}),
      ...(reason ? { reason } : {}),
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
    });
  }
  return out;
}

/** 僅顧客可看的 reason（不含 developer_reason）。 */
function toPublicRejectionReasons(raw: unknown): BridgeRejectionReasonPublic[] {
  return normalizeRejectionReasons(raw)
    .map((r) => {
      const reason = r.reason?.trim();
      if (!reason) return null;
      return {
        reason,
        createdAt: r.created_at ?? null,
      };
    })
    .filter((r): r is BridgeRejectionReasonPublic => r !== null);
}

function depositPayerFromRecord(source: Prisma.JsonValue | null): DepositPayerInfo {
  return (
    parseDepositPayerSource(source as Record<string, unknown> | null | undefined) ??
    EMPTY_DEPOSIT_PAYER
  );
}

function depositEventFromRecord(e: {
  type: string;
  amount: string | null;
  currency: string | null;
  subtotalAmount: string | null;
  developerFeeAmount: string | null;
  exchangeFeeAmount: string | null;
  gasFee: string | null;
  destinationTxHash: string | null;
  source: Prisma.JsonValue | null;
  occurredAt: Date | null;
}): DepositEvent {
  return {
    type: e.type,
    amount: e.amount,
    currency: e.currency,
    subtotalAmount: e.subtotalAmount,
    developerFeeAmount: e.developerFeeAmount,
    exchangeFeeAmount: e.exchangeFeeAmount,
    gasFee: e.gasFee,
    destinationTxHash: e.destinationTxHash,
    occurredAt: e.occurredAt ? e.occurredAt.toISOString() : null,
    ...depositPayerFromRecord(e.source),
  };
}

function depositPayerFromEvents(
  events: Array<{ type: string; source: Prisma.JsonValue | null }>,
): DepositPayerInfo {
  const sourceEvent =
    events.find((e) => e.type === 'funds_received' && e.source) ??
    events.find((e) => e.source);
  return depositPayerFromRecord(sourceEvent?.source ?? null);
}

function shouldUseCustomerNamedPayout(): boolean {
  return process.env.BRIDGE_CUSTOMER_NAMED_PAYOUT !== 'false';
}

/** 判斷 customer 是否至少有一個 approved 的 endorsement（可交易）。 */
function canTransact(kycStatus: string, endorsements: BridgeEndorsement[]): boolean {
  if (!APPROVED_KYC_STATUSES.has(kycStatus)) return false;
  if (endorsements.length === 0) return true; // 沒回傳 endorsement 時以 KYC 狀態為準
  return endorsements.some((e) => e.status === 'approved');
}

/**
 * 判斷 Bridge 是否回報「資源不存在」（customer / kyc_link 已被刪除或 sandbox 重置）。
 * 偵測條件：HTTP 404 且 body 的 code === 'not_found'（message 常見為 "Customer not found"）。
 * 以 code 為主、message 為後備（較穩定）。
 */
function isBridgeNotFound(error: unknown): boolean {
  if (!(error instanceof BridgeError) || error.statusCode !== 404) return false;
  try {
    const parsed = JSON.parse(error.bridgeBody) as { code?: string };
    if (parsed.code === 'not_found') return true;
  } catch {
    // body 非 JSON，落到 message 後備比對
  }
  return /not[_\s]?found|customer not found/i.test(error.bridgeBody);
}

function parseVirtualAccountHistory(body: unknown): BridgeVirtualAccountEventResponse[] {
  if (Array.isArray(body)) {
    return body as BridgeVirtualAccountEventResponse[];
  }
  if (body && typeof body === 'object') {
    const data = (body as BridgeVirtualAccountHistoryResponse).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

function isDuplicateLiquidationAddress(error: unknown): boolean {
  if (!(error instanceof BridgeError)) return false;
  if (error.statusCode !== 400 && error.statusCode !== 409) return false;
  try {
    const parsed = JSON.parse(error.bridgeBody) as { code?: string; message?: string };
    const haystack = `${parsed.code ?? ''} ${parsed.message ?? ''} ${error.bridgeBody}`.toLowerCase();
    return haystack.includes('duplicate') || haystack.includes('already');
  } catch {
    return /duplicate|already/i.test(error.bridgeBody);
  }
}

function matchesLiquidationRoute(
  la: BridgeLiquidationAddressResponse,
  pair: typeof LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  destinationAddress: string,
): boolean {
  return (
    la.chain === pair.sourceChain
    && la.currency === pair.sourceCurrency
    && la.destination_payment_rail === pair.destinationRail
    && la.destination_currency === pair.destinationCurrency
    && (la.destination_address?.toLowerCase() ?? '') === destinationAddress.toLowerCase()
  );
}

function matchesPayoutLiquidationRoute(
  la: BridgeLiquidationAddressResponse,
  params: {
    destinationRail: string;
    destinationCurrency: string;
    externalAccountId: string;
  },
): boolean {
  const source = PAYOUT_LIQUIDATION_SOURCE;
  return (
    la.chain === source.sourceChain
    && la.currency === source.sourceCurrency
    && la.destination_payment_rail === params.destinationRail
    && la.destination_currency === params.destinationCurrency
    && (la.external_account_id ?? '') === params.externalAccountId
  );
}

function buildPayoutDestinationReferenceFields(
  destinationRail: string,
  destinationReference?: string,
): Record<string, string> {
  if (!destinationReference) return {};
  const rail = destinationRail.toLowerCase();
  if (rail === 'wire') return { destination_wire_message: destinationReference };
  if (rail === 'spei') return { destination_spei_reference: destinationReference };
  if (rail === 'sepa') return { destination_sepa_reference: destinationReference };
  if (rail === 'ach' || rail === 'ach_push' || rail === 'ach_same_day') {
    return { destination_ach_reference: destinationReference };
  }
  return { destination_reference: destinationReference };
}

export class BridgeService {
  // ── Customer / KYC ──────────────────────────────────────────────────

  /**
   * 取得或建立用戶的 Bridge KYC（individual）/ KYB（business）link。
   * 若用戶尚未有 kyc_link 則向 Bridge 建立；已存在則回傳並順手刷新狀態。
   *
   * KYB（type=business）時 fullName 為公司法定名稱；UBO / 文件等於 hosted 流程內收集。
   */
  static async getOrCreateKycLink(
    userId: string,
    params: CreateKycLinkParams,
  ): Promise<KycLinkResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeKycLink(params.type);
    }

    const existing = await prisma.bridgeCustomer.findUnique({ where: { userId } });

    // 既有 customer 申請額外 endorsement（例如 BRL→pix、COP→cop）：
    // 走 Bridge GET /customers/{id}/kyc_link?endorsement=...，而非重建 kyc_link。
    if (existing?.bridgeCustomerId && params.endorsements?.length) {
      const status = await this.getCustomerStatus(userId);
      const missing = params.endorsements.filter(
        (endorsement) => !status.endorsements.some(
          (e) => e.name === endorsement && e.status === 'approved',
        ),
      );
      if (missing.length > 0) {
        const endorsement = missing[0]!;
        const link = await this.getEndorsementKycLink(
          userId,
          endorsement,
          params.redirectUri,
        );
        return {
          bridgeCustomerId: existing.bridgeCustomerId,
          kycLinkId: existing.kycLinkId,
          customerType: existing.customerType as BridgeCustomerType,
          kycLink: link.kycLink,
          tosLink: existing.tosLink,
          kycStatus: existing.kycStatus,
          tosStatus: existing.tosStatus,
          requestedEndorsement: link.endorsement,
        };
      }
    }

    if (existing?.kycLinkId) {
      try {
        // 已建立過：刷新狀態後回傳既有連結
        return await this.refreshKycLinkStatus(userId, existing.kycLinkId);
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;

        // Bridge 端 customer / kyc_link 已不存在（sandbox 重置或被刪）。
        // 清除失效參照並重建，而不是把 404 丟回 App。
        await this.clearStaleCustomer(userId);

        // 以舊 kycLinkId 推導 idempotency key：同一批並發重建會共用同一把鑰匙
        // → Bridge 端去重，不會建立多個 customer。
        const result = await this.createKycLinkForUser(
          userId,
          params,
          `kyc-rebuild:${existing.kycLinkId}`,
        );

        appLogger.info('[BridgeService] Rebuilt stale Bridge customer', {
          userId,
          oldCustomerId: existing.bridgeCustomerId,
          oldKycLinkId: existing.kycLinkId,
          newCustomerId: result.bridgeCustomerId,
          newKycLinkId: result.kycLinkId,
        });

        return result;
      }
    }

    // 首次建立：以 userId 為 idempotency key，避免並發首呼建立重複 customer。
    return this.createKycLinkForUser(userId, params, `kyc-new:${userId}`);
  }

  /** 實際向 Bridge 建立 KYC/KYB link 並 upsert 本地紀錄。 */
  private static async createKycLinkForUser(
    userId: string,
    params: CreateKycLinkParams,
    idempotencyKey: string,
  ): Promise<KycLinkResult> {
    const { type, fullName } = params;
    // Bridge 的 /kyc_links 將 email 列為必填
    const resolvedEmail = params.email ?? (await this.resolveUserEmail(userId)) ?? null;
    if (!resolvedEmail) {
      throw new BridgeError(
        400,
        'email is required to create a Bridge KYC/KYB link (none provided and user has no email).',
        'createKycLinkForUser',
      );
    }

    const created = await bridgeFetch<BridgeKycLinkResponse>('/kyc_links', {
      method: 'POST',
      idempotencyKey,
      body: {
        type,
        full_name: fullName,
        email: resolvedEmail,
        ...(params.endorsements?.length ? { endorsements: params.endorsements } : {}),
        ...(params.redirectUri ? { redirect_uri: params.redirectUri } : {}),
        ...(params.transliteratedFirstName
          ? { transliterated_first_name: params.transliteratedFirstName }
          : {}),
        ...(params.transliteratedMiddleName
          ? { transliterated_middle_name: params.transliteratedMiddleName }
          : {}),
        ...(params.transliteratedLastName
          ? { transliterated_last_name: params.transliteratedLastName }
          : {}),
        ...(type === 'business' && params.transliteratedBusinessLegalName
          ? { transliterated_business_legal_name: params.transliteratedBusinessLegalName }
          : {}),
      },
    });

    const record = await prisma.bridgeCustomer.upsert({
      where: { userId },
      create: {
        userId,
        bridgeCustomerId: created.customer_id ?? null,
        kycLinkId: created.id,
        customerType: type,
        email: resolvedEmail,
        kycLink: created.kyc_link ?? null,
        tosLink: created.tos_link ?? null,
        kycStatus: created.kyc_status ?? 'not_started',
        tosStatus: created.tos_status ?? 'pending',
      },
      update: {
        bridgeCustomerId: created.customer_id ?? null,
        kycLinkId: created.id,
        customerType: type,
        email: resolvedEmail,
        kycLink: created.kyc_link ?? null,
        tosLink: created.tos_link ?? null,
        kycStatus: created.kyc_status ?? 'not_started',
        tosStatus: created.tos_status ?? 'pending',
      },
    });

    appLogger.info('[BridgeService] KYC/KYB link created', {
      userId,
      kycLinkId: created.id,
      type,
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      kycLinkId: record.kycLinkId,
      customerType: record.customerType as BridgeCustomerType,
      kycLink: record.kycLink,
      tosLink: record.tosLink,
      kycStatus: record.kycStatus,
      tosStatus: record.tosStatus,
    };
  }

  /**
   * 清除本地失效的 Bridge customer 參照（Bridge 端已不存在時呼叫）。
   * 將 customer / kyc_link ids 與狀態歸零，讓下一次建立以「無 customer」乾淨開始。
   */
  private static async clearStaleCustomer(userId: string): Promise<void> {
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
  private static async ensureCustomerNamedPayout(userId: string): Promise<void> {
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

  /** 透過 kyc_link ID 向 Bridge 拉取最新 KYC / TOS 狀態並同步 DB。 */
  private static async refreshKycLinkStatus(
    userId: string,
    kycLinkId: string,
  ): Promise<KycLinkResult> {
    const link = await bridgeFetch<BridgeKycLinkResponse>(`/kyc_links/${kycLinkId}`);

    const record = await prisma.bridgeCustomer.update({
      where: { userId },
      data: {
        ...(link.customer_id ? { bridgeCustomerId: link.customer_id } : {}),
        ...(link.kyc_link ? { kycLink: link.kyc_link } : {}),
        ...(link.tos_link ? { tosLink: link.tos_link } : {}),
        ...(link.kyc_status ? { kycStatus: link.kyc_status } : {}),
        ...(link.tos_status ? { tosStatus: link.tos_status } : {}),
        ...(link.rejection_reasons !== undefined
          ? { rejectionReasons: asJson(normalizeRejectionReasons(link.rejection_reasons)) }
          : {}),
      },
    });

    if (APPROVED_KYC_STATUSES.has(record.kycStatus)) {
      await this.ensureCustomerNamedPayout(userId);
    }

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      kycLinkId: record.kycLinkId,
      customerType: record.customerType as BridgeCustomerType,
      kycLink: record.kycLink,
      tosLink: record.tosLink,
      kycStatus: record.kycStatus,
      tosStatus: record.tosStatus,
    };
  }

  /**
   * 為「已完成 base KYC」的既有 customer 取得額外 endorsement 的 hosted flow URL。
   * Bridge: GET /customers/{customerID}/kyc_link?endorsement=pix|cop|sepa|...
   */
  static async getEndorsementKycLink(
    userId: string,
    endorsement: BridgeEndorsementType,
    redirectUri?: string,
  ): Promise<EndorsementLinkResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeEndorsementLink(endorsement);
    }

    const record = await prisma.bridgeCustomer.findUnique({ where: { userId } });
    if (!record?.bridgeCustomerId) {
      throw new BridgeError(
        409,
        'Bridge customer not onboarded. Complete base KYC before requesting endorsements.',
        'getEndorsementKycLink',
      );
    }

    const query = new URLSearchParams({ endorsement });
    if (redirectUri) {
      query.set('redirect_uri', redirectUri);
    }

    const response = await bridgeFetch<{ url: string }>(
      `/customers/${record.bridgeCustomerId}/kyc_link?${query.toString()}`,
    );

    if (!response?.url) {
      throw new BridgeError(
        502,
        `Bridge returned no endorsement KYC URL for "${endorsement}".`,
        'getEndorsementKycLink',
      );
    }

    appLogger.info('[BridgeService] Endorsement KYC link fetched', {
      userId,
      endorsement,
      bridgeCustomerId: record.bridgeCustomerId,
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      endorsement,
      kycLink: response.url,
    };
  }

  /**
   * 依法幣幣別申請額外 endorsement 的 hosted flow（BRL→pix、COP→cop 等）。
   * 前端可傳 { currency: "brl" } 或 { currency: "cop" }，不必記 endorsement 名稱。
   */
  static async getEndorsementKycLinkForCurrency(
    userId: string,
    currency: string,
    redirectUri?: string,
  ): Promise<EndorsementLinkResult> {
    const normalized = currency.toLowerCase();
    const endorsement = resolveEndorsementForCurrency(normalized);
    if (!endorsement) {
      throw new BridgeError(
        400,
        `${normalized.toUpperCase()} does not require an additional Bridge endorsement.`,
        'getEndorsementKycLinkForCurrency',
      );
    }

    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeEndorsementLink(endorsement, normalized);
    }

    const link = await this.getEndorsementKycLink(userId, endorsement, redirectUri);
    return { ...link, currency: normalized };
  }

  /** 取得用戶 Bridge customer 狀態（含 endorsements 與可否交易）。 */
  static async getCustomerStatus(userId: string): Promise<CustomerStatusResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeCustomerStatus();
    }

    const record = await prisma.bridgeCustomer.findUnique({ where: { userId } });
    if (!record) {
      throw new BridgeError(404, 'Bridge customer not found. Create a KYC link first.', 'getCustomerStatus');
    }

    // 還沒有 customer_id（KYC 尚未開始/完成）時，嘗試用 kyc_link 刷新
    if (!record.bridgeCustomerId) {
      if (record.kycLinkId) {
        await this.refreshKycLinkStatus(userId, record.kycLinkId);
      }
      const reloaded = await prisma.bridgeCustomer.findUnique({ where: { userId } });
      return {
        bridgeCustomerId: reloaded?.bridgeCustomerId ?? null,
        customerType: (reloaded?.customerType ?? record.customerType) as BridgeCustomerType,
        kycStatus: reloaded?.kycStatus ?? 'not_started',
        tosStatus: reloaded?.tosStatus ?? 'pending',
        endorsements: [],
        canTransact: false,
        customerNamedPayoutConfigured: false,
        rejectionReasons: toPublicRejectionReasons(reloaded?.rejectionReasons),
      };
    }

    let customer: BridgeCustomerResponse;
    try {
      customer = await bridgeFetch<BridgeCustomerResponse>(`/customers/${record.bridgeCustomerId}`);
    } catch (error) {
      if (!isBridgeNotFound(error)) throw error;

      // Bridge 端 customer 已不存在：主動清除 stale 參照，
      // 讓下一次 POST /kyc-link 以乾淨狀態重建，不再卡關。
      appLogger.warn('[BridgeService] Stale Bridge customer on status fetch, clearing', {
        userId,
        staleCustomerId: record.bridgeCustomerId,
      });
      await this.clearStaleCustomer(userId);

      return {
        bridgeCustomerId: null,
        customerType: record.customerType as BridgeCustomerType,
        kycStatus: 'not_started',
        tosStatus: 'pending',
        endorsements: [],
        canTransact: false,
        customerNamedPayoutConfigured: false,
        rejectionReasons: [],
      };
    }

    const endorsements = customer.endorsements ?? [];
    const kycStatus = customer.kyc_status ?? record.kycStatus;
    const tosStatus = customer.tos_status ?? record.tosStatus;
    const rejectionReasons = APPROVED_KYC_STATUSES.has(kycStatus)
      ? []
      : normalizeRejectionReasons(customer.rejection_reasons);

    await prisma.bridgeCustomer.update({
      where: { userId },
      data: {
        kycStatus,
        tosStatus,
        endorsements: asJson(endorsements),
        rejectionReasons: asJson(rejectionReasons),
      },
    });

    if (canTransact(kycStatus, endorsements)) {
      await this.ensureCustomerNamedPayout(userId);
    }

    const payoutRecord = await prisma.bridgeCustomer.findUnique({
      where: { userId },
      select: { customerNamedPayoutAt: true },
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      customerType: record.customerType as BridgeCustomerType,
      kycStatus,
      tosStatus,
      endorsements,
      canTransact: canTransact(kycStatus, endorsements),
      customerNamedPayoutConfigured: !!payoutRecord?.customerNamedPayoutAt,
      rejectionReasons: toPublicRejectionReasons(rejectionReasons),
    };
  }

  /** 取得已通過 KYC、可建立 transfer 的 bridgeCustomerId，否則丟出清楚錯誤。 */
  private static async requireTransactableCustomer(userId: string): Promise<string> {
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
  private static async assertEndorsementForCurrency(
    userId: string,
    currency: string,
  ): Promise<void> {
    const required = resolveEndorsementForCurrency(currency);
    if (!required) return;

    // 向 Bridge 拉最新 customer 狀態（同時同步本地 endorsements）
    const status = await this.getCustomerStatus(userId);
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
  private static async withStaleCustomerGuard<T>(
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
      await this.clearStaleCustomer(userId);

      throw new BridgeError(
        409,
        'Bridge customer no longer exists. Re-complete KYC before transacting.',
        path,
      );
    }
  }

  // ── On-ramp：Virtual Accounts（入金）────────────────────────────────

  /**
   * 取得或建立使用者的入金 Virtual Account（每組 source/destination 一個）。
   * VA 是持久的法幣入金帳戶：入金後 Bridge 自動轉成穩定幣送往 destination，免 memo。
   */
  static async getOrCreateVirtualAccount(
    userId: string,
    params: CreateVirtualAccountParams,
  ): Promise<VirtualAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeVirtualAccount(userId, params.sourceCurrency);
    }

    const bridgeCustomerId = await this.requireTransactableCustomer(userId);

    // 入金幣別需要對應的 rail endorsement（gbp→faster_payments 等）；
    // 缺少時回清楚的 409，而非 Bridge 的神秘 401 not_allowed。
    await this.assertEndorsementForCurrency(userId, params.sourceCurrency);

    const address = params.toAddress ?? (await this.resolveUserWalletAddress(userId));
    if (!address) {
      throw new BridgeError(
        400,
        'No destination address: provide toAddress or set the user wallet address.',
        'getOrCreateVirtualAccount',
      );
    }

    const existing = await prisma.bridgeVirtualAccount.findUnique({
      where: {
        userId_sourceCurrency_destinationRail_destinationCurrency: {
          userId,
          sourceCurrency: params.sourceCurrency,
          destinationRail: params.destinationRail,
          destinationCurrency: params.destinationCurrency,
        },
      },
    });

    if (existing) {
      try {
        // 向 Bridge 確認 VA 仍存在並同步最新 deposit instructions / 狀態
        const va = await bridgeFetch<BridgeVirtualAccountResponse>(
          `/customers/${bridgeCustomerId}/virtual_accounts/${existing.bridgeVirtualAccountId}`,
        );
        return this.persistVirtualAccount(userId, bridgeCustomerId, params, address, va);
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;
        // VA 在 Bridge 端已不存在（sandbox 重置等）：刪本地後重建
        await prisma.bridgeVirtualAccount.delete({ where: { id: existing.id } }).catch(() => undefined);
        appLogger.warn('[BridgeService] Stale virtual account, recreating', {
          userId,
          staleVirtualAccountId: existing.bridgeVirtualAccountId,
        });
      }
    }

    // idempotency key 綁定 (userId + 組合)，並發首建會在 Bridge 端去重
    const idempotencyKey = `va:${userId}:${params.sourceCurrency}:${params.destinationRail}:${params.destinationCurrency}`;

    const va = await this.withStaleCustomerGuard(userId, 'getOrCreateVirtualAccount', () =>
      bridgeFetch<BridgeVirtualAccountResponse>(
        `/customers/${bridgeCustomerId}/virtual_accounts`,
        {
          method: 'POST',
          idempotencyKey,
          body: {
            source: { currency: params.sourceCurrency },
            destination: {
              payment_rail: params.destinationRail,
              currency: params.destinationCurrency,
              address,
            },
            // 費率由後端依入金幣別 + 目的幣套用（fee_config 或 developer_fee_percent）
            ...buildVirtualAccountFeeBody(params.sourceCurrency, params.destinationCurrency),
          },
        },
      ),
    );

    return this.persistVirtualAccount(userId, bridgeCustomerId, params, address, va);
  }

  /** 列出使用者的入金 Virtual Accounts。 */
  static async listVirtualAccounts(userId: string): Promise<VirtualAccountResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeVirtualAccounts(userId);
    }

    const records = await prisma.bridgeVirtualAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toVirtualAccountResult(r));
  }

  /**
   * 列出使用者的入金紀錄（供前端輪詢）。
   * 資料偏舊時向 Bridge 拉 VA history 補同步，不完全依賴 webhook。
   */
  static async listDeposits(
    userId: string,
    virtualAccountId?: string,
    options?: { force?: boolean },
  ): Promise<DepositResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      const deposits = DemoService.bridgeDeposits();
      if (virtualAccountId) {
        return deposits.filter((d) => d.bridgeVirtualAccountId === virtualAccountId);
      }
      return deposits;
    }

    if (await this.shouldSyncDeposits(userId, virtualAccountId, options?.force)) {
      try {
        await this.syncDepositsFromBridge(userId, virtualAccountId);
      } catch (error) {
        logError('[BridgeService] Deposit sync from Bridge failed', error as Error, {
          userId,
          virtualAccountId,
        });
      }
    }

    return this.aggregateDeposits(userId, virtualAccountId);
  }

  private static async shouldSyncDeposits(
    userId: string,
    virtualAccountId?: string,
    force?: boolean,
  ): Promise<boolean> {
    if (force) return true;

    const vaCount = await prisma.bridgeVirtualAccount.count({
      where: {
        userId,
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
    });
    if (vaCount === 0) return false;

    const latestEvent = await prisma.bridgeVirtualAccountEvent.findFirst({
      where: {
        userId,
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { occurredAt: true, createdAt: true, type: true, depositId: true },
    });

    if (!latestEvent) return true;

    const lastAt = latestEvent.occurredAt ?? latestEvent.createdAt;
    const hasPendingDeposit = await this.hasPendingDeposit(userId, virtualAccountId);
    const minIntervalMs = hasPendingDeposit
      ? getBridgeDepositsPendingSyncMinIntervalMs()
      : getBridgeDepositsSyncMinIntervalMs();

    return !isWithinInterval(lastAt, minIntervalMs);
  }

  /** 是否有進行中入金（已 funds_received 但尚未 payment_processed）。 */
  private static async hasPendingDeposit(
    userId: string,
    virtualAccountId?: string,
  ): Promise<boolean> {
    const events = await prisma.bridgeVirtualAccountEvent.findMany({
      where: {
        userId,
        depositId: { not: null },
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
      select: { depositId: true, type: true },
    });

    const byDeposit = new Map<string, Set<string>>();
    for (const event of events) {
      if (!event.depositId) continue;
      const types = byDeposit.get(event.depositId) ?? new Set<string>();
      types.add(event.type);
      byDeposit.set(event.depositId, types);
    }

    for (const types of byDeposit.values()) {
      if (types.has('funds_received') && !types.has('payment_processed')) {
        return true;
      }
    }
    return false;
  }

  /** 向 Bridge 拉 VA activity history 並 upsert 至本地帳本。 */
  static async syncDepositsFromBridge(userId: string, virtualAccountId?: string): Promise<void> {
    const customer = await prisma.bridgeCustomer.findUnique({
      where: { userId },
      select: { bridgeCustomerId: true },
    });
    if (!customer?.bridgeCustomerId) return;

    const virtualAccounts = await prisma.bridgeVirtualAccount.findMany({
      where: {
        userId,
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
      select: { bridgeVirtualAccountId: true },
    });
    if (virtualAccounts.length === 0) return;

    let syncedEvents = 0;
    for (const va of virtualAccounts) {
      const history = await bridgeFetch<unknown>(
        `/customers/${customer.bridgeCustomerId}/virtual_accounts/${va.bridgeVirtualAccountId}/history?limit=${VA_HISTORY_PAGE_LIMIT}`,
      );
      const events = parseVirtualAccountHistory(history);
      for (const event of events) {
        await this.syncVirtualAccountActivity({
          ...event,
          virtual_account_id: event.virtual_account_id ?? va.bridgeVirtualAccountId,
        });
        syncedEvents += 1;
      }
    }

    appLogger.info('[BridgeService] Deposits synced from Bridge', {
      userId,
      virtualAccountId,
      virtualAccountCount: virtualAccounts.length,
      syncedEvents,
    });
  }

  private static async aggregateDeposits(
    userId: string,
    virtualAccountId?: string,
  ): Promise<DepositResult[]> {
    const events = await prisma.bridgeVirtualAccountEvent.findMany({
      where: {
        userId,
        depositId: { not: null },
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
      orderBy: { occurredAt: 'asc' },
    });

    const groups = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.depositId as string;
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }

    const deposits: DepositResult[] = [];
    for (const [depositId, group] of groups) {
      const sorted = [...group].sort(
        (a, b) => this.eventTime(a).getTime() - this.eventTime(b).getTime(),
      );
      const latest = sorted[sorted.length - 1]!;
      const first = sorted[0]!;
      const received = sorted.find((e) => e.type === 'funds_received');
      const payment = [...sorted]
        .reverse()
        .find((e) => e.type === 'payment_processed' || e.type === 'payment_submitted');
      const txHashEvent = [...sorted].reverse().find((e) => e.destinationTxHash);
      const payer = depositPayerFromEvents(sorted);

      deposits.push({
        depositId,
        bridgeVirtualAccountId: latest.bridgeVirtualAccountId,
        status: latest.type,
        completed: sorted.some((e) => e.type === 'payment_processed'),
        amount: received?.amount ?? latest.amount,
        currency: received?.currency ?? latest.currency,
        netAmount: payment?.subtotalAmount ?? latest.subtotalAmount,
        developerFeeAmount: payment?.developerFeeAmount ?? latest.developerFeeAmount,
        exchangeFeeAmount: payment?.exchangeFeeAmount ?? latest.exchangeFeeAmount,
        gasFee: payment?.gasFee ?? latest.gasFee,
        destinationTxHash: txHashEvent?.destinationTxHash ?? null,
        createdAt: this.eventTime(first).toISOString(),
        updatedAt: this.eventTime(latest).toISOString(),
        ...payer,
        events: sorted.map((e) => depositEventFromRecord(e)),
      });
    }

    deposits.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return deposits;
  }

  private static eventTime(e: {
    occurredAt: Date | null;
    createdAt: Date;
  }): Date {
    return e.occurredAt ?? e.createdAt;
  }

  private static async persistVirtualAccount(
    userId: string,
    bridgeCustomerId: string,
    params: CreateVirtualAccountParams,
    address: string,
    va: BridgeVirtualAccountResponse,
  ): Promise<VirtualAccountResult> {
    const data = {
      userId,
      bridgeCustomerId,
      bridgeVirtualAccountId: va.id,
      status: va.status ?? 'activated',
      sourceCurrency: params.sourceCurrency,
      destinationRail: va.destination?.payment_rail ?? params.destinationRail,
      destinationCurrency: va.destination?.currency ?? params.destinationCurrency,
      destinationAddress: va.destination?.address ?? address,
      developerFeePercent: va.developer_fee_percent ?? null,
      depositInstructions: va.source_deposit_instructions
        ? asJson(va.source_deposit_instructions)
        : Prisma.JsonNull,
    };

    const record = await prisma.bridgeVirtualAccount.upsert({
      where: { bridgeVirtualAccountId: va.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Virtual account ready', {
      userId,
      bridgeVirtualAccountId: va.id,
      sourceCurrency: params.sourceCurrency,
    });

    return this.toVirtualAccountResult(record);
  }

  private static toVirtualAccountResult(
    record: Prisma.BridgeVirtualAccountGetPayload<Record<string, never>>,
  ): VirtualAccountResult {
    const fallbackPercent = onRampFeePercent(record.sourceCurrency, record.destinationCurrency)
      ?? '0.00';
    const depositFee = buildDepositDeveloperFee(
      record.sourceCurrency,
      record.developerFeePercent,
      fallbackPercent,
    );

    return {
      bridgeVirtualAccountId: record.bridgeVirtualAccountId,
      status: record.status,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress,
      developerFeePercent: depositFee.developerFeePercent,
      depositFee,
      minDeposit: resolveOnRampMinDeposit(
        record.sourceCurrency,
        depositFee.developerFeePercent,
      ),
      depositInstructions:
        (record.depositInstructions as unknown as VirtualAccountResult['depositInstructions']) ??
        null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** 處理 virtual_account.activity webhook：寫入入金/出款活動帳本。 */
  static async syncVirtualAccountActivity(
    event: BridgeVirtualAccountEventResponse,
    context?: BridgeWebhookSyncContext,
  ): Promise<void> {
    const vaId = event.virtual_account_id;
    if (!event.id || !vaId) return;

    const va = await prisma.bridgeVirtualAccount.findUnique({
      where: { bridgeVirtualAccountId: vaId },
      select: { userId: true },
    });
    if (!va) {
      logDebug('[BridgeService] VA activity for untracked virtual account', { vaId });
      return;
    }

    const occurredAt = event.created_at ? new Date(event.created_at) : null;
    const data = {
      userId: va.userId,
      bridgeVirtualAccountId: vaId,
      bridgeEventId: event.id,
      type: event.type ?? 'unknown',
      amount: event.amount ?? null,
      currency: event.currency ?? null,
      subtotalAmount: event.subtotal_amount ?? null,
      developerFeeAmount: event.developer_fee_amount ?? null,
      exchangeFeeAmount: event.exchange_fee_amount ?? null,
      gasFee: event.gas_fee ?? null,
      depositId: event.deposit_id ?? null,
      destinationTxHash: event.destination_tx_hash ?? null,
      source: event.source ? asJson(event.source) : Prisma.JsonNull,
      occurredAt,
    };

    await prisma.bridgeVirtualAccountEvent.upsert({
      where: { bridgeEventId: event.id },
      create: data,
      update: data,
    });

    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromBridgeVaActivity({
      userId: va.userId,
      bridgeEventId: event.id,
      eventType: event.type ?? 'unknown',
      amount: event.amount ?? null,
      currency: event.currency ?? null,
      developerFeeAmount: event.developer_fee_amount ?? null,
      subtotalAmount: event.subtotal_amount ?? null,
      depositId: event.deposit_id ?? null,
      bridgeVirtualAccountId: vaId,
      occurredAt,
    }).catch((err) => {
      logError('[BridgeService] Failed to record platform revenue from VA activity', err as Error, {
        bridgeEventId: event.id,
        userId: va.userId,
      });
    });

    if (event.type === 'refunded') {
      await this.reverseReferralCashbackForBridgeVaRefund({
        depositId: event.deposit_id ?? null,
        refundEventId: event.id,
        ...(context?.webhookEventId ? { webhookEventId: context.webhookEventId } : {}),
      });
    }

    appLogger.info('[BridgeService] VA activity recorded', {
      userId: va.userId,
      vaId,
      type: event.type,
      depositId: event.deposit_id,
    });
  }

  // ── Off-ramp：Payout Liquidation Address（Base USDC → 法幣）──────────

  static listPayoutOptions(): PayoutOption[] {
    return PAYOUT_OPTION_BASES.map((option) => ({
      ...option,
      minDeposit: resolvePayoutMinDeposit(
        option.rail,
        payoutLiquidationFeePercent(option.currency),
      ),
    }));
  }

  /**
   * 取得或建立永久 Base USDC 出金地址，自動兌換成法幣送到 external account。
   * 類似 crypto 入金 LA：建立一次，固定地址，可重複打 USDC。
   */
  static async getOrCreatePayoutAddress(
    userId: string,
    params: CreatePayoutAddressParams,
  ): Promise<PayoutLiquidationAddressResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutAddress(userId, params);
    }

    const bridgeCustomerId = await this.requireTransactableCustomer(userId);
    const source = PAYOUT_LIQUIDATION_SOURCE;

    assertOffRampRailCurrency(params.destinationRail, params.destinationCurrency);

    const externalAccount = await prisma.bridgeExternalAccount.findFirst({
      where: {
        userId,
        bridgeExternalAccountId: params.externalAccountId,
        active: true,
      },
      select: { currency: true },
    });
    if (!externalAccount) {
      throw new BridgeError(
        404,
        'External account not found for this user.',
        'getOrCreatePayoutAddress',
      );
    }
    if (externalAccount.currency.toLowerCase() !== params.destinationCurrency.toLowerCase()) {
      throw new BridgeError(
        400,
        `External account currency (${externalAccount.currency}) does not match destinationCurrency (${params.destinationCurrency}).`,
        'getOrCreatePayoutAddress',
      );
    }

    await this.assertEndorsementForCurrency(userId, params.destinationCurrency);

    await this.ensureCustomerNamedPayout(userId);

    const returnAddress = params.returnAddress ?? (await this.resolveUserScaAddress(userId));

    const existing = await prisma.bridgeLiquidationAddress.findUnique({
      where: {
        userId_direction_sourceChain_sourceCurrency_destinationRail_destinationCurrency_bridgeExternalAccountId: {
          userId,
          direction: 'out',
          sourceChain: source.sourceChain,
          sourceCurrency: source.sourceCurrency,
          destinationRail: params.destinationRail,
          destinationCurrency: params.destinationCurrency,
          bridgeExternalAccountId: params.externalAccountId,
        },
      },
    });

    if (existing) {
      try {
        const la = await bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses/${existing.bridgeLiquidationAddressId}`,
        );
        return this.persistPayoutLiquidationAddress(
          userId,
          bridgeCustomerId,
          params,
          returnAddress,
          la,
        );
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;
        await prisma.bridgeLiquidationAddress
          .delete({ where: { id: existing.id } })
          .catch(() => undefined);
        appLogger.warn('[BridgeService] Stale payout liquidation address, recreating', {
          userId,
          staleId: existing.bridgeLiquidationAddressId,
        });
      }
    }

    const feePercent = payoutLiquidationFeePercent(params.destinationCurrency);
    const idempotencyKey = [
      'la-payout',
      userId,
      source.sourceChain,
      source.sourceCurrency,
      params.destinationRail,
      params.destinationCurrency,
      params.externalAccountId,
    ].join(':');

    let la: BridgeLiquidationAddressResponse;
    try {
      la = await this.withStaleCustomerGuard(userId, 'getOrCreatePayoutAddress', () =>
        bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses`,
          {
            method: 'POST',
            idempotencyKey,
            body: {
              chain: source.sourceChain,
              currency: source.sourceCurrency,
              external_account_id: params.externalAccountId,
              destination_payment_rail: params.destinationRail,
              destination_currency: params.destinationCurrency,
              custom_developer_fee_percent: feePercent,
              ...buildPayoutDestinationReferenceFields(
                params.destinationRail,
                params.destinationReference,
              ),
              ...(returnAddress
                ? { return_instructions: { address: returnAddress } }
                : {}),
            },
          },
        ),
      );
    } catch (error) {
      if (!isDuplicateLiquidationAddress(error)) throw error;

      const remote = await this.findRemotePayoutLiquidationAddress(
        bridgeCustomerId,
        params,
      );
      if (!remote) throw error;
      la = remote;
    }

    return this.persistPayoutLiquidationAddress(
      userId,
      bridgeCustomerId,
      params,
      returnAddress,
      la,
    );
  }

  static async listPayoutAddresses(userId: string): Promise<PayoutLiquidationAddressResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutAddresses(userId);
    }

    const records = await prisma.bridgeLiquidationAddress.findMany({
      where: { userId, direction: 'out', state: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toPayoutLiquidationAddressResult(r));
  }

  static async listPayoutDrains(
    userId: string,
    bridgeLiquidationAddressId: string,
    limit = 50,
  ): Promise<PayoutDrainResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgePayoutDrains(bridgeLiquidationAddressId);
    }

    const record = await prisma.bridgeLiquidationAddress.findFirst({
      where: { userId, direction: 'out', bridgeLiquidationAddressId },
    });
    if (!record?.bridgeCustomerId) {
      throw new BridgeError(
        404,
        'Payout liquidation address not found for this user.',
        'listPayoutDrains',
      );
    }

    const list = await bridgeFetch<BridgeDrainListResponse>(
      `/customers/${record.bridgeCustomerId}/liquidation_addresses/${bridgeLiquidationAddressId}/drains?limit=${Math.min(Math.max(limit, 1), 200)}`,
    );

    return (list.data ?? []).map((drain) => this.toPayoutDrainResult(drain));
  }

  private static async findRemotePayoutLiquidationAddress(
    bridgeCustomerId: string,
    params: CreatePayoutAddressParams,
  ): Promise<BridgeLiquidationAddressResponse | null> {
    const list = await bridgeFetch<BridgeLiquidationAddressListResponse>(
      `/customers/${bridgeCustomerId}/liquidation_addresses`,
    );
    const match = (list.data ?? []).find((la) => matchesPayoutLiquidationRoute(la, params));
    return match ?? null;
  }

  private static async persistPayoutLiquidationAddress(
    userId: string,
    bridgeCustomerId: string,
    params: CreatePayoutAddressParams,
    returnAddress: string | null,
    la: BridgeLiquidationAddressResponse,
  ): Promise<PayoutLiquidationAddressResult> {
    if (!la.id || !la.address) {
      throw new BridgeError(
        502,
        'Bridge payout liquidation address response missing id or deposit address.',
        'persistPayoutLiquidationAddress',
      );
    }

    const source = PAYOUT_LIQUIDATION_SOURCE;
    const data = {
      userId,
      bridgeCustomerId,
      bridgeLiquidationAddressId: la.id,
      direction: 'out' as const,
      state: la.state ?? 'active',
      sourceChain: la.chain ?? source.sourceChain,
      sourceCurrency: la.currency ?? source.sourceCurrency,
      destinationRail: la.destination_payment_rail ?? params.destinationRail,
      destinationCurrency: la.destination_currency ?? params.destinationCurrency,
      bridgeExternalAccountId: la.external_account_id ?? params.externalAccountId,
      depositAddress: la.address,
      blockchainMemo: la.blockchain_memo ?? null,
      returnAddress,
      developerFeePercent:
        la.custom_developer_fee_percent ?? payoutLiquidationFeePercent(params.destinationCurrency),
    };

    const record = await prisma.bridgeLiquidationAddress.upsert({
      where: { bridgeLiquidationAddressId: la.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Payout liquidation address ready', {
      userId,
      bridgeLiquidationAddressId: la.id,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
    });

    return this.toPayoutLiquidationAddressResult(record);
  }

  private static toPayoutLiquidationAddressResult(
    record: Prisma.BridgeLiquidationAddressGetPayload<Record<string, never>>,
  ): PayoutLiquidationAddressResult {
    const payoutFee = buildPayoutDeveloperFee(
      record.developerFeePercent,
      record.destinationCurrency,
    );

    return {
      bridgeLiquidationAddressId: record.bridgeLiquidationAddressId,
      state: record.state,
      sourceChain: record.sourceChain,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      bridgeExternalAccountId: record.bridgeExternalAccountId ?? '',
      depositAddress: record.depositAddress,
      blockchainMemo: record.blockchainMemo,
      developerFeePercent: payoutFee.developerFeePercent,
      payoutFee,
      minDeposit: resolvePayoutMinDeposit(
        record.destinationRail,
        payoutFee.developerFeePercent,
        record.sourceCurrency,
      ),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private static toPayoutDrainResult(drain: BridgeDrainResponse): PayoutDrainResult {
    return {
      bridgeDrainId: drain.id,
      bridgeLiquidationAddressId: drain.liquidation_address_id ?? '',
      state: drain.state ?? 'unknown',
      amount: drain.amount ?? null,
      currency: drain.currency ?? null,
      depositTxHash: drain.deposit_tx_hash ?? null,
      destination: drain.destination ?? null,
      createdAt: drain.created_at ?? null,
    };
  }

  // ── Crypto 入金：Liquidation Address（Tron USDT → Base USDC）──────────

  /**
   * 取得或建立永久 Tron USDT 入金地址，自動兌換為 Base USDC 送到使用者 SCA。
   * 類似 Virtual Account：建立一次，固定地址 + memo，可重複入金。
   */
  static async getOrCreateLiquidationAddress(
    userId: string,
    params: CreateLiquidationAddressParams = {},
  ): Promise<LiquidationAddressResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeLiquidationAddress(userId);
    }

    const bridgeCustomerId = await this.requireTransactableCustomer(userId);
    const pair = LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC;

    const destinationAddress = params.toAddress ?? (await this.resolveUserScaAddress(userId));
    if (!destinationAddress) {
      throw new BridgeError(
        400,
        'No destination address: provide toAddress or register scaAddress via PATCH /api/wallet/sca.',
        'getOrCreateLiquidationAddress',
      );
    }

    const existing = await prisma.bridgeLiquidationAddress.findFirst({
      where: {
        userId,
        direction: 'in',
        sourceChain: pair.sourceChain,
        sourceCurrency: pair.sourceCurrency,
        destinationRail: pair.destinationRail,
        destinationCurrency: pair.destinationCurrency,
        bridgeExternalAccountId: null,
      },
    });

    if (existing) {
      try {
        const la = await bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses/${existing.bridgeLiquidationAddressId}`,
        );
        return this.persistLiquidationAddress(userId, bridgeCustomerId, destinationAddress, la);
      } catch (error) {
        if (!isBridgeNotFound(error)) throw error;
        await prisma.bridgeLiquidationAddress.delete({ where: { id: existing.id } }).catch(() => undefined);
        appLogger.warn('[BridgeService] Stale liquidation address, recreating', {
          userId,
          staleId: existing.bridgeLiquidationAddressId,
        });
      }
    }

    const feePercent = cryptoLiquidationFeePercent();
    const idempotencyKey = `la-tron-base:${userId}:${destinationAddress.toLowerCase()}`;

    let la: BridgeLiquidationAddressResponse;
    try {
      la = await this.withStaleCustomerGuard(userId, 'getOrCreateLiquidationAddress', () =>
        bridgeFetch<BridgeLiquidationAddressResponse>(
          `/customers/${bridgeCustomerId}/liquidation_addresses`,
          {
            method: 'POST',
            idempotencyKey,
            body: {
              chain: pair.sourceChain,
              currency: pair.sourceCurrency,
              destination_payment_rail: pair.destinationRail,
              destination_currency: pair.destinationCurrency,
              destination_address: destinationAddress,
              custom_developer_fee_percent: feePercent,
              ...(params.returnAddress
                ? { return_instructions: { address: params.returnAddress } }
                : {}),
            },
          },
        ),
      );
    } catch (error) {
      if (!isDuplicateLiquidationAddress(error)) throw error;

      const remote = await this.findRemoteLiquidationAddress(
        bridgeCustomerId,
        pair,
        destinationAddress,
      );
      if (!remote) throw error;
      la = remote;
    }

    return this.persistLiquidationAddress(userId, bridgeCustomerId, destinationAddress, la);
  }

  static async listLiquidationAddresses(userId: string): Promise<LiquidationAddressResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeLiquidationAddresses(userId);
    }

    const records = await prisma.bridgeLiquidationAddress.findMany({
      where: { userId, direction: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toLiquidationAddressResult(r));
  }

  private static async findRemoteLiquidationAddress(
    bridgeCustomerId: string,
    pair: typeof LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
    destinationAddress: string,
  ): Promise<BridgeLiquidationAddressResponse | null> {
    const list = await bridgeFetch<BridgeLiquidationAddressListResponse>(
      `/customers/${bridgeCustomerId}/liquidation_addresses`,
    );
    const match = (list.data ?? []).find((la) =>
      matchesLiquidationRoute(la, pair, destinationAddress),
    );
    return match ?? null;
  }

  private static async persistLiquidationAddress(
    userId: string,
    bridgeCustomerId: string,
    destinationAddress: string,
    la: BridgeLiquidationAddressResponse,
  ): Promise<LiquidationAddressResult> {
    if (!la.id || !la.address) {
      throw new BridgeError(
        502,
        'Bridge liquidation address response missing id or deposit address.',
        'persistLiquidationAddress',
      );
    }

    const data = {
      userId,
      bridgeCustomerId,
      bridgeLiquidationAddressId: la.id,
      direction: 'in' as const,
      state: la.state ?? 'active',
      sourceChain: la.chain,
      sourceCurrency: la.currency,
      destinationRail: la.destination_payment_rail ?? LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationRail,
      destinationCurrency: la.destination_currency ?? LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationCurrency,
      destinationAddress: la.destination_address ?? destinationAddress,
      depositAddress: la.address,
      blockchainMemo: la.blockchain_memo ?? null,
      developerFeePercent: la.custom_developer_fee_percent ?? cryptoLiquidationFeePercent(),
    };

    const record = await prisma.bridgeLiquidationAddress.upsert({
      where: { bridgeLiquidationAddressId: la.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Liquidation address ready', {
      userId,
      bridgeLiquidationAddressId: la.id,
      sourceChain: la.chain,
      sourceCurrency: la.currency,
    });

    return this.toLiquidationAddressResult(record);
  }

  private static toLiquidationAddressResult(
    record: Prisma.BridgeLiquidationAddressGetPayload<Record<string, never>>,
  ): LiquidationAddressResult {
    const depositFee = buildDepositDeveloperFee(
      record.sourceCurrency,
      record.developerFeePercent,
      cryptoLiquidationFeePercent(),
    );

    return {
      bridgeLiquidationAddressId: record.bridgeLiquidationAddressId,
      state: record.state,
      sourceChain: record.sourceChain,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress ?? '',
      depositAddress: record.depositAddress,
      blockchainMemo: record.blockchainMemo,
      developerFeePercent: depositFee.developerFeePercent,
      depositFee,
      minDeposit: resolveTronUsdtMinDeposit(depositFee.developerFeePercent),
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** 拉取單筆 transfer 最新狀態並同步 DB。 */
  static async getTransfer(userId: string, bridgeTransferId: string): Promise<TransferResult> {
    if (await DemoService.isDemoUser(userId)) {
      if (!DemoService.bridgeDemoTransferIds().includes(bridgeTransferId)) {
        throw new BridgeError(404, 'Transfer not found for this user.', 'getTransfer');
      }
      const currency = bridgeTransferId.replace('demo-transfer-onramp-', '') || 'usd';
      return DemoService.bridgeTransfer(userId, bridgeTransferId, currency);
    }

    const record = await prisma.bridgeTransfer.findFirst({
      where: { userId, bridgeTransferId },
    });
    if (!record) {
      throw new BridgeError(404, 'Transfer not found for this user.', 'getTransfer');
    }

    const transfer = await bridgeFetch<BridgeTransferResponse>(`/transfers/${bridgeTransferId}`);

    const updated = await prisma.bridgeTransfer.update({
      where: { id: record.id },
      data: {
        state: transfer.state ?? record.state,
        destinationTxHash: transfer.receipt?.destination_tx_hash ?? record.destinationTxHash,
        depositInstructions: transfer.source_deposit_instructions
          ? asJson(transfer.source_deposit_instructions)
          : asJson(record.depositInstructions ?? null),
      },
    });

    return this.toTransferResult(updated);
  }

  static async listTransfers(userId: string, limit = 50): Promise<TransferResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeTransfers(userId);
    }

    const records = await prisma.bridgeTransfer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return records.map((r) => this.toTransferResult(r));
  }

  // ── External Accounts（off-ramp 出金銀行）──────────────────────────

  static async createExternalAccount(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<ExternalAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeExternalAccountFromBody(body);
    }

    const bridgeCustomerId = await this.requireTransactableCustomer(userId);

    const payload = this.buildExternalAccountPayload(body);

    const account = await this.withStaleCustomerGuard(userId, 'createExternalAccount', () =>
      bridgeFetch<BridgeExternalAccountResponse>(
        `/customers/${bridgeCustomerId}/external_accounts`,
        { method: 'POST', body: payload },
      ),
    );

    const record = await prisma.bridgeExternalAccount.upsert({
      where: { bridgeExternalAccountId: account.id },
      create: {
        userId,
        bridgeExternalAccountId: account.id,
        bridgeCustomerId,
        bankName: account.bank_name ?? null,
        accountOwnerName: account.account_owner_name ?? null,
        last4: account.last_4 ?? null,
        currency: account.currency ?? (body.currency as string) ?? 'usd',
        active: account.active ?? true,
      },
      update: {
        ...(account.bank_name ? { bankName: account.bank_name } : {}),
        ...(account.account_owner_name ? { accountOwnerName: account.account_owner_name } : {}),
        ...(account.last_4 ? { last4: account.last_4 } : {}),
        ...(account.active !== undefined ? { active: account.active } : {}),
      },
    });

    appLogger.info('[BridgeService] External account created', {
      userId,
      externalAccountId: account.id,
    });

    return {
      bridgeExternalAccountId: record.bridgeExternalAccountId,
      bankName: record.bankName,
      accountOwnerName: record.accountOwnerName,
      last4: record.last4,
      currency: record.currency,
      active: record.active,
    };
  }

  static async listExternalAccounts(userId: string): Promise<ExternalAccountResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeExternalAccounts();
    }

    const records = await prisma.bridgeExternalAccount.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => ({
      bridgeExternalAccountId: r.bridgeExternalAccountId,
      bankName: r.bankName,
      accountOwnerName: r.accountOwnerName,
      last4: r.last4,
      currency: r.currency,
      active: r.active,
    }));
  }

  static async deleteExternalAccount(
    userId: string,
    externalAccountId: string,
  ): Promise<ExternalAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      if (!DemoService.isBridgeExternalAccountId(externalAccountId)) {
        throw new BridgeError(
          404,
          'External account not found for this user.',
          'deleteExternalAccount',
        );
      }
      const config = DemoService.bridgeExternalAccounts().find(
        (a) => a.bridgeExternalAccountId === externalAccountId,
      );
      return DemoService.bridgeDeletedExternalAccount(config?.currency ?? 'usd');
    }

    const record = await prisma.bridgeExternalAccount.findFirst({
      where: { userId, bridgeExternalAccountId: externalAccountId },
    });
    if (!record) {
      throw new BridgeError(
        404,
        'External account not found for this user.',
        'deleteExternalAccount',
      );
    }

    const bridgeCustomerId = record.bridgeCustomerId ?? (await this.requireTransactableCustomer(userId));

    const account = await this.withStaleCustomerGuard(userId, 'deleteExternalAccount', () =>
      bridgeFetch<BridgeExternalAccountResponse>(
        `/customers/${bridgeCustomerId}/external_accounts/${externalAccountId}`,
        { method: 'DELETE' },
      ),
    );

    const updated = await prisma.bridgeExternalAccount.update({
      where: { id: record.id },
      data: { active: account.active ?? false },
    });

    appLogger.info('[BridgeService] External account deleted', {
      userId,
      externalAccountId,
    });

    return {
      bridgeExternalAccountId: updated.bridgeExternalAccountId,
      bankName: updated.bankName,
      accountOwnerName: updated.accountOwnerName,
      last4: updated.last4,
      currency: updated.currency,
      active: updated.active,
    };
  }

  // ── 私有 helpers ────────────────────────────────────────────────────

  /** 將我們的 external account schema 轉成 Bridge 期望的 payload。 */
  private static buildExternalAccountPayload(body: Record<string, unknown>): Record<string, unknown> {
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = body[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      const nested = body.account as Record<string, unknown> | undefined;
      if (nested) {
        for (const key of keys) {
          const value = nested[key];
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
      }
      return undefined;
    };

    const accountType =
      pick('accountType', 'account_type')
      ?? (pick('brCode', 'br_code') ? 'pix' : undefined)
      ?? (pick('pixKey', 'pix_key') ? 'pix' : undefined)
      ?? (pick('clabe') ? 'clabe' : undefined)
      ?? (pick('sortCode', 'sort_code') ? 'gb' : undefined)
      ?? (pick('iban') ? 'iban' : undefined)
      ?? 'us';

    const payload: Record<string, unknown> = {
      currency: pick('currency') ?? 'usd',
      ...(pick('bankName', 'bank_name') ? { bank_name: pick('bankName', 'bank_name') } : {}),
      ...(pick('accountOwnerName', 'account_owner_name')
        ? { account_owner_name: pick('accountOwnerName', 'account_owner_name') }
        : {}),
      ...(pick('firstName', 'first_name') ? { first_name: pick('firstName', 'first_name') } : {}),
      ...(pick('lastName', 'last_name') ? { last_name: pick('lastName', 'last_name') } : {}),
      ...(pick('businessName', 'business_name')
        ? { account_owner_type: 'business', business_name: pick('businessName', 'business_name') }
        : { account_owner_type: 'individual' }),
      ...(body.address ? { address: body.address } : {}),
    };

    if (accountType === 'iban') {
      payload.account_type = 'iban';
      payload.iban = {
        account_number: pick('iban'),
        ...(pick('bic') ? { bic: pick('bic') } : {}),
        ...(body.address && (body.address as Record<string, unknown>).country
          ? { country: (body.address as Record<string, unknown>).country }
          : {}),
      };
      return payload;
    }

    if (accountType === 'clabe') {
      payload.account_type = 'clabe';
      payload.clabe = { account_number: pick('clabe') };
      return payload;
    }

    if (accountType === 'pix') {
      payload.account_type = 'pix';
      const brCode = pick('brCode', 'br_code');
      const documentNumber = pick('documentNumber', 'document_number');
      if (brCode) {
        payload.br_code = {
          br_code: brCode,
          ...(documentNumber ? { document_number: documentNumber } : {}),
        };
      } else {
        payload.pix_key = {
          pix_key: pick('pixKey', 'pix_key'),
          ...(documentNumber ? { document_number: documentNumber } : {}),
        };
      }
      return payload;
    }

    if (accountType === 'gb') {
      payload.account_type = 'gb';
      payload.account = {
        account_number: pick('accountNumber', 'account_number'),
        sort_code: pick('sortCode', 'sort_code'),
      };
      return payload;
    }

    const checkingOrSavings = pick('checkingOrSavings', 'checking_or_savings') ?? 'checking';
    payload.account_type = 'us';
    payload.account = {
      account_number: pick('accountNumber', 'account_number'),
      routing_number: pick('routingNumber', 'routing_number'),
      checking_or_savings: checkingOrSavings,
    };
    return payload;
  }

  private static async persistTransfer(
    userId: string,
    bridgeCustomerId: string,
    direction: 'onramp' | 'offramp' | 'crypto',
    transfer: BridgeTransferResponse,
    extra: { destinationAddress?: string; destinationExternalId?: string } = {},
  ): Promise<TransferResult> {
    const data = {
      userId,
      bridgeCustomerId,
      bridgeTransferId: transfer.id,
      direction,
      state: transfer.state ?? 'awaiting_funds',
      amount: transfer.amount ?? null,
      developerFee: transfer.developer_fee ?? null,
      sourceRail: transfer.source?.payment_rail ?? null,
      sourceCurrency: transfer.source?.currency ?? null,
      destinationRail: transfer.destination?.payment_rail ?? null,
      destinationCurrency: transfer.destination?.currency ?? null,
      destinationAddress: transfer.destination?.to_address ?? extra.destinationAddress ?? null,
      destinationExternalId:
        transfer.destination?.external_account_id ?? extra.destinationExternalId ?? null,
      destinationTxHash: transfer.receipt?.destination_tx_hash ?? null,
      depositInstructions: transfer.source_deposit_instructions
        ? asJson(transfer.source_deposit_instructions)
        : Prisma.JsonNull,
      clientReferenceId: transfer.client_reference_id ?? null,
    };

    const record = await prisma.bridgeTransfer.upsert({
      where: { bridgeTransferId: transfer.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] Transfer created', {
      userId,
      direction,
      bridgeTransferId: transfer.id,
      state: record.state,
    });

    return this.toTransferResult(record);
  }

  private static toTransferResult(
    record: Prisma.BridgeTransferGetPayload<Record<string, never>>,
  ): TransferResult {
    return {
      bridgeTransferId: record.bridgeTransferId,
      direction: record.direction as TransferResult['direction'],
      state: record.state,
      amount: record.amount,
      sourceRail: record.sourceRail,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress,
      destinationExternalId: record.destinationExternalId,
      depositInstructions:
        (record.depositInstructions as TransferResult['depositInstructions']) ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private static async resolveUserEmail(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? null;
  }

  private static async resolveUserWalletAddress(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { scaAddress: true, walletAddress: true },
    });
    return user?.scaAddress ?? user?.walletAddress ?? null;
  }

  /** 僅回傳 ERC-4337 SCA（crypto-to-crypto 出金到 Base 用）。 */
  private static async resolveUserScaAddress(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { scaAddress: true },
    });
    return user?.scaAddress ?? null;
  }

  // ── Webhook 持久化（供 webhook service 呼叫）────────────────────────

  /** 依 bridgeTransferId 更新 transfer 狀態（webhook 用）。找不到則略過。 */
  static async syncTransferFromWebhook(
    transfer: BridgeTransferResponse,
    context?: BridgeWebhookSyncContext,
  ): Promise<void> {
    if (!transfer.id) return;
    const existing = await prisma.bridgeTransfer.findUnique({
      where: { bridgeTransferId: transfer.id },
      select: { id: true },
    });
    if (!existing) {
      logDebug('[BridgeService] Webhook transfer not tracked locally', { transferId: transfer.id });
      return;
    }

    await prisma.bridgeTransfer.update({
      where: { id: existing.id },
      data: {
        state: transfer.state ?? undefined,
        ...(transfer.receipt?.destination_tx_hash
          ? { destinationTxHash: transfer.receipt.destination_tx_hash }
          : {}),
        ...(transfer.source_deposit_instructions
          ? { depositInstructions: asJson(transfer.source_deposit_instructions) }
          : {}),
      },
    });

    if (transfer.state === 'payment_processed') {
      const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
      await PlatformRevenueService.recordFromBridgeTransfer(transfer.id).catch((err) => {
        logError('[BridgeService] Failed to record platform revenue from transfer', err as Error, {
          bridgeTransferId: transfer.id,
        });
      });
    }

    if (transfer.state && BRIDGE_TRANSFER_REVERSAL_STATES.has(transfer.state)) {
      await ReferralCashbackService.reverseByIdempotencyKey(
        `bridge:transfer:${transfer.id}:payment_processed`,
        'bridge_transfer_refunded',
        context?.webhookEventId ?? `bridge:transfer:${transfer.id}:${transfer.state}`,
      );
    }
  }

  /** 依 customer_id 更新 KYC / endorsement 狀態（webhook 用）。 */
  static async syncCustomerFromWebhook(customer: BridgeCustomerResponse): Promise<void> {
    if (!customer.id) return;
    const existing = await prisma.bridgeCustomer.findFirst({
      where: { bridgeCustomerId: customer.id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      logDebug('[BridgeWebhook] Webhook customer not tracked locally', { customerId: customer.id });
      return;
    }

    const kycStatus = customer.kyc_status ?? customer.status;

    await prisma.bridgeCustomer.update({
      where: { id: existing.id },
      data: {
        ...(kycStatus ? { kycStatus } : {}),
        ...(customer.tos_status ? { tosStatus: customer.tos_status } : {}),
        ...(customer.endorsements ? { endorsements: asJson(customer.endorsements) } : {}),
        ...(customer.rejection_reasons !== undefined
          ? { rejectionReasons: asJson(normalizeRejectionReasons(customer.rejection_reasons)) }
          : {}),
      },
    });

    if (kycStatus && APPROVED_KYC_STATUSES.has(kycStatus)) {
      await this.ensureCustomerNamedPayout(existing.userId);
    }
  }

  /** Bridge liquidation address drain（webhook 用）。 */
  static async syncLiquidationDrainFromWebhook(
    drain: BridgeDrainResponse,
    context?: BridgeWebhookSyncContext,
  ): Promise<void> {
    if (!drain.id) return;

    const { PlatformRevenueService } = await import('../../platform-insights/services/platformRevenueService');
    await PlatformRevenueService.recordFromBridgeLiquidationDrain(drain).catch((err) => {
      logError('[BridgeService] Failed to record platform revenue from liquidation drain', err as Error, {
        drainId: drain.id,
        liquidationAddressId: drain.liquidation_address_id,
      });
    });

    if (drain.state && BRIDGE_DRAIN_REVERSAL_STATES.has(drain.state)) {
      await ReferralCashbackService.reverseByIdempotencyKey(
        `bridge:liquidation:${drain.id}:payment_processed`,
        'bridge_liquidation_refunded',
        context?.webhookEventId ?? `bridge:liquidation:${drain.id}:${drain.state}`,
      );
    }
  }

  /** VA 入金退款：依 depositId 找到原 payment_processed 事件並沖銷 refer 返現。 */
  private static async reverseReferralCashbackForBridgeVaRefund(params: {
    depositId: string | null;
    refundEventId: string;
    webhookEventId?: string;
  }): Promise<void> {
    if (!params.depositId) {
      logDebug('[BridgeService] VA refund without depositId, skipping cashback reversal', {
        refundEventId: params.refundEventId,
      });
      return;
    }

    const original = await prisma.bridgeVirtualAccountEvent.findFirst({
      where: {
        depositId: params.depositId,
        type: 'payment_processed',
      },
      select: { bridgeEventId: true },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!original) {
      logDebug('[BridgeService] VA refund: no payment_processed event for deposit', {
        depositId: params.depositId,
        refundEventId: params.refundEventId,
      });
      return;
    }

    await ReferralCashbackService.reverseByIdempotencyKey(
      `bridge:va:${original.bridgeEventId}`,
      'bridge_va_refunded',
      params.webhookEventId ?? params.refundEventId,
    );
  }

  /**
   * 帳號刪除時刪除 Bridge customer（best-effort；失敗不阻擋 DB 刪除）。
   */
  static async deleteCustomerForUser(userId: string): Promise<void> {
    if (!process.env.BRIDGE_API_KEY?.trim()) {
      logDebug('[BridgeService] Skipping Bridge customer delete — BRIDGE_API_KEY not configured', { userId });
      return;
    }

    const customer = await prisma.bridgeCustomer.findUnique({
      where: { userId },
      select: { bridgeCustomerId: true },
    });

    if (!customer?.bridgeCustomerId) {
      return;
    }

    const bridgeCustomerId = customer.bridgeCustomerId;

    try {
      await bridgeFetch(`/customers/${bridgeCustomerId}`, { method: 'DELETE' });
      appLogger.info('[BridgeService] Deleted Bridge customer during account deletion', {
        userId,
        bridgeCustomerId,
      });
    } catch (error) {
      if (error instanceof BridgeError && error.statusCode === 404) {
        logDebug('[BridgeService] Bridge customer already deleted', { userId, bridgeCustomerId });
        return;
      }
      logError('[BridgeService] Failed to delete Bridge customer during account deletion', error as Error, {
        userId,
        bridgeCustomerId,
      });
    }
  }

  /** KYC link 狀態變化（webhook 用），用 link id 對應。 */
  static async syncKycLinkFromWebhook(link: BridgeKycLinkResponse): Promise<void> {
    if (!link.id) return;
    const existing = await prisma.bridgeCustomer.findFirst({
      where: { kycLinkId: link.id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      logDebug('[BridgeWebhook] Webhook kyc_link not tracked locally', { kycLinkId: link.id });
      return;
    }

    const kycStatus = link.kyc_status;

    await prisma.bridgeCustomer.update({
      where: { id: existing.id },
      data: {
        ...(link.customer_id ? { bridgeCustomerId: link.customer_id } : {}),
        ...(kycStatus ? { kycStatus } : {}),
        ...(link.tos_status ? { tosStatus: link.tos_status } : {}),
        ...(link.rejection_reasons !== undefined
          ? { rejectionReasons: asJson(normalizeRejectionReasons(link.rejection_reasons)) }
          : {}),
      },
    });

    if (kycStatus && APPROVED_KYC_STATUSES.has(kycStatus)) {
      await this.ensureCustomerNamedPayout(existing.userId);
    }
  }
}

/** webhook 事件去重：寫入成功回傳 true；重複（P2002）回傳 false。 */
export async function recordWebhookEvent(
  eventId: string,
  eventCategory: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await prisma.bridgeWebhookEvent.create({
      data: {
        bridgeEventId: eventId,
        eventCategory,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}
