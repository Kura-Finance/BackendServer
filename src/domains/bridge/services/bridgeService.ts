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
 *   4. off-ramp       → POST /v0/transfers  (source=crypto, destination=fiat/external_account)
 *
 * Base: https://api.bridge.xyz/v0
 */

import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug } from '../../logger';
import type {
  BridgeCustomerResponse,
  BridgeCustomerType,
  BridgeEndorsement,
  BridgeExternalAccountResponse,
  BridgeFeeConfig,
  BridgeKycLinkResponse,
  BridgeTransferResponse,
  BridgeVirtualAccountEventResponse,
  BridgeVirtualAccountResponse,
  CreateKycLinkParams,
  CreateVirtualAccountParams,
  CustomerStatusResult,
  DepositResult,
  ExternalAccountResult,
  KycLinkResult,
  TransferResult,
  VirtualAccountResult,
} from '../models/types';

const DEFAULT_BRIDGE_API = 'https://api.bridge.xyz/v0';

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

// ── 入金（VA）費率：平台向用戶收取的 developer fee，依入金幣別套用 ──────
//
// 設計：費率一律由後端決定（不接受 client 指定），避免用戶把 fee 改成 0。
//
// 現行：用 developer_fee_percent（單一百分比 / VA）。
// 注意：Bridge VA 沒有獨立的「FX fee / spread」欄位，想對用戶收的 spread
// 一律併進 fee_percent；Bridge 自身的匯率 spread 另從 exchange_fee 扣（吃 margin）。
//
// 百分比為 base 100：'0.1' = 0.1%。
const VA_FEE_PERCENT: Record<string, string> = {
  usd: '0.10', // ACH/Fedwire 0.10%（developer_fee_percent 無法區分 rail，也收不了 Fedwire 固定費）
  gbp: '0.20', // FPS 0.10% + FX 0.10%
  eur: '0.20', // SEPA 0.10% + FX 0.10%
  mxn: '0.35', // SPEI 0.20% + FX 0.15%
  brl: '0.35', // PIX 0.20% + FX 0.15%
  cop: '0.50', // PSE 0.30% + FX 0.20%
};

// 之後若向 Bridge 申請開通 fee_config Beta，可改用 per-rail 的固定費 + 百分比
// （例如 USD 的 Fedwire $8 + 0.10%）。設 BRIDGE_FEE_CONFIG_ENABLED=true 啟用。
const VA_FEE_CONFIG: Record<string, BridgeFeeConfig> = {
  usd: {
    source: {
      ach_push: { fee_percent: '0.10' },
      wire: { fee_amount: '8.00', fee_percent: '0.10' }, // Fedwire $8 + 0.10%
    },
  },
  gbp: { source: { default: { fee_percent: '0.20' } } },
  eur: { source: { default: { fee_percent: '0.20' } } },
  mxn: { source: { default: { fee_percent: '0.35' } } },
  brl: { source: { default: { fee_percent: '0.35' } } },
  cop: { source: { default: { fee_percent: '0.50' } } },
};

function isFeeConfigEnabled(): boolean {
  return process.env.BRIDGE_FEE_CONFIG_ENABLED === 'true';
}

/**
 * 依入金幣別組出要送給 Bridge 的費用欄位。
 * - 現行（預設）→ 回傳 { developer_fee_percent }
 * - BRIDGE_FEE_CONFIG_ENABLED=true 且該幣別有設定 → 回傳 { fee_config }
 * - 無對應費率設定 → 回傳 {}（不收費）
 * fee_config 與 developer_fee_percent 互斥，只會回傳其中一個。
 */
function buildVirtualAccountFeeBody(
  sourceCurrency: string,
): { fee_config: BridgeFeeConfig } | { developer_fee_percent: string } | Record<string, never> {
  const currency = sourceCurrency.toLowerCase();
  if (isFeeConfigEnabled()) {
    const feeConfig = VA_FEE_CONFIG[currency];
    if (feeConfig) return { fee_config: feeConfig };
  }
  const percent = VA_FEE_PERCENT[currency];
  if (percent) return { developer_fee_percent: percent };
  return {};
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
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
    const existing = await prisma.bridgeCustomer.findUnique({ where: { userId } });

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
      },
    });
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
      },
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

  /** 取得用戶 Bridge customer 狀態（含 endorsements 與可否交易）。 */
  static async getCustomerStatus(userId: string): Promise<CustomerStatusResult> {
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
      };
    }

    const endorsements = customer.endorsements ?? [];
    const kycStatus = customer.kyc_status ?? record.kycStatus;
    const tosStatus = customer.tos_status ?? record.tosStatus;

    await prisma.bridgeCustomer.update({
      where: { userId },
      data: {
        kycStatus,
        tosStatus,
        endorsements: asJson(endorsements),
      },
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      customerType: record.customerType as BridgeCustomerType,
      kycStatus,
      tosStatus,
      endorsements,
      canTransact: canTransact(kycStatus, endorsements),
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
    const bridgeCustomerId = await this.requireTransactableCustomer(userId);

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
            // 費率由後端依入金幣別套用（fee_config 或 developer_fee_percent）
            ...buildVirtualAccountFeeBody(params.sourceCurrency),
          },
        },
      ),
    );

    return this.persistVirtualAccount(userId, bridgeCustomerId, params, address, va);
  }

  /** 列出使用者的入金 Virtual Accounts。 */
  static async listVirtualAccounts(userId: string): Promise<VirtualAccountResult[]> {
    const records = await prisma.bridgeVirtualAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.toVirtualAccountResult(r));
  }

  /**
   * 列出使用者的入金紀錄（供前端輪詢）。
   * 把 VA 活動事件依 depositId 聚合成「一筆入金」，帶出狀態與金額。
   * @param virtualAccountId 選填，只查特定 VA 的入金。
   */
  static async listDeposits(userId: string, virtualAccountId?: string): Promise<DepositResult[]> {
    const events = await prisma.bridgeVirtualAccountEvent.findMany({
      where: {
        userId,
        // 只聚合屬於某筆存款的事件（排除 account_update / activation 等無 depositId 的）
        depositId: { not: null },
        ...(virtualAccountId ? { bridgeVirtualAccountId: virtualAccountId } : {}),
      },
      orderBy: { occurredAt: 'asc' },
    });

    // 依 depositId 分組
    const groups = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.depositId as string;
      const list = groups.get(key);
      if (list) list.push(e);
      else groups.set(key, [e]);
    }

    const deposits: DepositResult[] = [];
    for (const [depositId, group] of groups) {
      // group 已依 occurredAt 升序（null 在前），保險起見再排一次
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
        events: sorted.map((e) => ({
          type: e.type,
          amount: e.amount,
          currency: e.currency,
          subtotalAmount: e.subtotalAmount,
          developerFeeAmount: e.developerFeeAmount,
          exchangeFeeAmount: e.exchangeFeeAmount,
          gasFee: e.gasFee,
          destinationTxHash: e.destinationTxHash,
          occurredAt: e.occurredAt ? e.occurredAt.toISOString() : null,
        })),
      });
    }

    // 最新的入金排前面
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
    return {
      bridgeVirtualAccountId: record.bridgeVirtualAccountId,
      status: record.status,
      sourceCurrency: record.sourceCurrency,
      destinationRail: record.destinationRail,
      destinationCurrency: record.destinationCurrency,
      destinationAddress: record.destinationAddress,
      developerFeePercent: record.developerFeePercent,
      depositInstructions:
        (record.depositInstructions as unknown as VirtualAccountResult['depositInstructions']) ??
        null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** 處理 virtual_account.activity webhook：寫入入金/出款活動帳本。 */
  static async syncVirtualAccountActivity(
    event: BridgeVirtualAccountEventResponse,
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
      occurredAt,
    };

    await prisma.bridgeVirtualAccountEvent.upsert({
      where: { bridgeEventId: event.id },
      create: data,
      update: data,
    });

    appLogger.info('[BridgeService] VA activity recorded', {
      userId: va.userId,
      vaId,
      type: event.type,
      depositId: event.deposit_id,
    });
  }

  // ── Off-ramp：Transfers（出金）──────────────────────────────────────

  static async createOffRamp(
    userId: string,
    params: {
      amount: string;
      sourceRail: string;
      sourceCurrency: string;
      destinationRail: string;
      destinationCurrency: string;
      externalAccountId: string;
      developerFee?: string;
      clientReferenceId?: string;
    },
  ): Promise<TransferResult> {
    const bridgeCustomerId = await this.requireTransactableCustomer(userId);

    // 確認該 external account 屬於此用戶
    const externalAccount = await prisma.bridgeExternalAccount.findFirst({
      where: { userId, bridgeExternalAccountId: params.externalAccountId },
      select: { id: true },
    });
    if (!externalAccount) {
      throw new BridgeError(404, 'External account not found for this user.', 'createOffRamp');
    }

    const transfer = await this.withStaleCustomerGuard(userId, 'createOffRamp', () =>
      bridgeFetch<BridgeTransferResponse>('/transfers', {
        method: 'POST',
        body: {
          amount: params.amount,
          on_behalf_of: bridgeCustomerId,
          ...(params.developerFee ? { developer_fee: params.developerFee } : {}),
          ...(params.clientReferenceId ? { client_reference_id: params.clientReferenceId } : {}),
          source: {
            payment_rail: params.sourceRail,
            currency: params.sourceCurrency,
          },
          destination: {
            payment_rail: params.destinationRail,
            currency: params.destinationCurrency,
            external_account_id: params.externalAccountId,
          },
        },
      }),
    );

    return this.persistTransfer(userId, bridgeCustomerId, 'offramp', transfer, {
      destinationExternalId: params.externalAccountId,
    });
  }

  /** 拉取單筆 transfer 最新狀態並同步 DB。 */
  static async getTransfer(userId: string, bridgeTransferId: string): Promise<TransferResult> {
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

  // ── 私有 helpers ────────────────────────────────────────────────────

  /** 將我們的 external account schema 轉成 Bridge 期望的 payload。 */
  private static buildExternalAccountPayload(body: Record<string, unknown>): Record<string, unknown> {
    const accountType = (body.accountType as string) ?? (body.iban ? 'iban' : 'us');
    const payload: Record<string, unknown> = {
      currency: (body.currency as string) ?? 'usd',
      ...(body.bankName ? { bank_name: body.bankName } : {}),
      ...(body.accountOwnerName ? { account_owner_name: body.accountOwnerName } : {}),
      ...(body.firstName ? { first_name: body.firstName } : {}),
      ...(body.lastName ? { last_name: body.lastName } : {}),
      ...(body.businessName
        ? { account_owner_type: 'business', business_name: body.businessName }
        : { account_owner_type: 'individual' }),
      ...(body.address ? { address: body.address } : {}),
    };

    if (accountType === 'iban') {
      payload.account_type = 'iban';
      payload.iban = {
        account_number: body.iban,
        ...(body.bic ? { bic: body.bic } : {}),
        ...(body.address && (body.address as Record<string, unknown>).country
          ? { country: (body.address as Record<string, unknown>).country }
          : {}),
      };
    } else {
      payload.account_type = 'us';
      payload.account = {
        account_number: body.accountNumber,
        routing_number: body.routingNumber,
      };
    }

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

  // ── Webhook 持久化（供 webhook service 呼叫）────────────────────────

  /** 依 bridgeTransferId 更新 transfer 狀態（webhook 用）。找不到則略過。 */
  static async syncTransferFromWebhook(transfer: BridgeTransferResponse): Promise<void> {
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
  }

  /** 依 customer_id 更新 KYC / endorsement 狀態（webhook 用）。 */
  static async syncCustomerFromWebhook(customer: BridgeCustomerResponse): Promise<void> {
    if (!customer.id) return;
    const existing = await prisma.bridgeCustomer.findFirst({
      where: { bridgeCustomerId: customer.id },
      select: { id: true },
    });
    if (!existing) {
      logDebug('[BridgeService] Webhook customer not tracked locally', { customerId: customer.id });
      return;
    }

    await prisma.bridgeCustomer.update({
      where: { id: existing.id },
      data: {
        ...(customer.kyc_status ? { kycStatus: customer.kyc_status } : {}),
        ...(customer.tos_status ? { tosStatus: customer.tos_status } : {}),
        ...(customer.endorsements ? { endorsements: asJson(customer.endorsements) } : {}),
      },
    });
  }

  /** KYC link 狀態變化（webhook 用），用 link id 對應。 */
  static async syncKycLinkFromWebhook(link: BridgeKycLinkResponse): Promise<void> {
    if (!link.id) return;
    const existing = await prisma.bridgeCustomer.findFirst({
      where: { kycLinkId: link.id },
      select: { id: true },
    });
    if (!existing) {
      logDebug('[BridgeService] Webhook kyc_link not tracked locally', { kycLinkId: link.id });
      return;
    }

    await prisma.bridgeCustomer.update({
      where: { id: existing.id },
      data: {
        ...(link.customer_id ? { bridgeCustomerId: link.customer_id } : {}),
        ...(link.kyc_status ? { kycStatus: link.kyc_status } : {}),
        ...(link.tos_status ? { tosStatus: link.tos_status } : {}),
      },
    });
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
