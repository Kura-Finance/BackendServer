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

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug } from '../../logger';
import type {
  BridgeCustomerResponse,
  BridgeEndorsement,
  BridgeExternalAccountResponse,
  BridgeKycLinkResponse,
  BridgeTransferResponse,
  CustomerStatusResult,
  ExternalAccountResult,
  KycLinkResult,
  TransferResult,
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

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** 判斷 customer 是否至少有一個 approved 的 endorsement（可交易）。 */
function canTransact(kycStatus: string, endorsements: BridgeEndorsement[]): boolean {
  if (!APPROVED_KYC_STATUSES.has(kycStatus)) return false;
  if (endorsements.length === 0) return true; // 沒回傳 endorsement 時以 KYC 狀態為準
  return endorsements.some((e) => e.status === 'approved');
}

export class BridgeService {
  // ── Customer / KYC ──────────────────────────────────────────────────

  /**
   * 取得或建立用戶的 Bridge KYC link。
   * 若用戶尚未有 kyc_link 則向 Bridge 建立；已存在則回傳並順手刷新狀態。
   */
  static async getOrCreateKycLink(
    userId: string,
    fullName: string,
    email: string | undefined,
    type: 'individual' | 'business',
  ): Promise<KycLinkResult> {
    const existing = await prisma.bridgeCustomer.findUnique({ where: { userId } });

    if (existing?.kycLinkId) {
      // 已建立過：刷新狀態後回傳既有連結
      const refreshed = await this.refreshKycLinkStatus(userId, existing.kycLinkId);
      return refreshed;
    }

    const resolvedEmail = email ?? (await this.resolveUserEmail(userId)) ?? undefined;

    const created = await bridgeFetch<BridgeKycLinkResponse>('/kyc_links', {
      method: 'POST',
      body: {
        full_name: fullName,
        type,
        ...(resolvedEmail ? { email: resolvedEmail } : {}),
      },
    });

    const record = await prisma.bridgeCustomer.upsert({
      where: { userId },
      create: {
        userId,
        bridgeCustomerId: created.customer_id ?? null,
        kycLinkId: created.id,
        customerType: type,
        email: resolvedEmail ?? null,
        fullName,
        kycLink: created.kyc_link ?? null,
        tosLink: created.tos_link ?? null,
        kycStatus: created.kyc_status ?? 'not_started',
        tosStatus: created.tos_status ?? 'pending',
        rawCustomer: asJson(created),
      },
      update: {
        ...(created.customer_id ? { bridgeCustomerId: created.customer_id } : {}),
        kycLinkId: created.id,
        customerType: type,
        ...(resolvedEmail ? { email: resolvedEmail } : {}),
        fullName,
        kycLink: created.kyc_link ?? null,
        tosLink: created.tos_link ?? null,
        kycStatus: created.kyc_status ?? 'not_started',
        tosStatus: created.tos_status ?? 'pending',
        rawCustomer: asJson(created),
      },
    });

    appLogger.info('[BridgeService] KYC link created', { userId, kycLinkId: created.id });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      kycLinkId: record.kycLinkId,
      kycLink: record.kycLink,
      tosLink: record.tosLink,
      kycStatus: record.kycStatus,
      tosStatus: record.tosStatus,
    };
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
        rawCustomer: asJson(link),
      },
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
      kycLinkId: record.kycLinkId,
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
        kycStatus: reloaded?.kycStatus ?? 'not_started',
        tosStatus: reloaded?.tosStatus ?? 'pending',
        endorsements: [],
        canTransact: false,
      };
    }

    const customer = await bridgeFetch<BridgeCustomerResponse>(`/customers/${record.bridgeCustomerId}`);
    const endorsements = customer.endorsements ?? [];
    const kycStatus = customer.kyc_status ?? record.kycStatus;
    const tosStatus = customer.tos_status ?? record.tosStatus;

    await prisma.bridgeCustomer.update({
      where: { userId },
      data: {
        kycStatus,
        tosStatus,
        endorsements: asJson(endorsements),
        rawCustomer: asJson(customer),
      },
    });

    return {
      bridgeCustomerId: record.bridgeCustomerId,
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

  // ── Transfers ───────────────────────────────────────────────────────

  static async createOnRamp(
    userId: string,
    params: {
      amount: string;
      sourceRail: string;
      sourceCurrency: string;
      destinationRail: string;
      destinationCurrency: string;
      toAddress?: string;
      developerFee?: string;
      clientReferenceId?: string;
      flexibleAmount?: boolean;
    },
  ): Promise<TransferResult> {
    const bridgeCustomerId = await this.requireTransactableCustomer(userId);

    const toAddress = params.toAddress ?? (await this.resolveUserWalletAddress(userId));
    if (!toAddress) {
      throw new BridgeError(
        400,
        'No destination address: provide toAddress or set the user wallet address.',
        'createOnRamp',
      );
    }

    const transfer = await bridgeFetch<BridgeTransferResponse>('/transfers', {
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
          to_address: toAddress,
        },
        ...(params.flexibleAmount ? { features: { flexible_amount: true } } : {}),
      },
    });

    return this.persistTransfer(userId, bridgeCustomerId, 'onramp', transfer, {
      destinationAddress: toAddress,
    });
  }

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

    const transfer = await bridgeFetch<BridgeTransferResponse>('/transfers', {
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
    });

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
        rawTransfer: asJson(transfer),
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

    const account = await bridgeFetch<BridgeExternalAccountResponse>(
      `/customers/${bridgeCustomerId}/external_accounts`,
      { method: 'POST', body: payload },
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
        rawAccount: asJson(account),
      },
      update: {
        ...(account.bank_name ? { bankName: account.bank_name } : {}),
        ...(account.account_owner_name ? { accountOwnerName: account.account_owner_name } : {}),
        ...(account.last_4 ? { last4: account.last_4 } : {}),
        ...(account.active !== undefined ? { active: account.active } : {}),
        rawAccount: asJson(account),
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
      rawTransfer: asJson(transfer),
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
        rawTransfer: asJson(transfer),
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
        rawCustomer: asJson(customer),
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
        rawCustomer: asJson(link),
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
