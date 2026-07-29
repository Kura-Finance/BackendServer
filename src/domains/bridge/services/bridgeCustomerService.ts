import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug, logError } from '../../logger';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeCustomerResponse,
  BridgeCustomerType,
  BridgeEndorsementType,
  BridgeKycLinkResponse,
  CreateKycLinkParams,
  CustomerStatusResult,
  EndorsementLinkResult,
  KycLinkResult,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import { resolveEndorsementForCurrency } from '../lib/bridgeEndorsement';
import { asJson, normalizeRejectionReasons, toPublicRejectionReasons } from '../lib/bridgeJson';
import {
  APPROVED_KYC_STATUSES,
  canTransact,
  clearStaleCustomer,
  ensureCustomerNamedPayout,
  isBridgeNotFound,
  resolveUserEmail,
} from '../lib/bridgeCustomerAccess';

export class BridgeCustomerService {
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
        await clearStaleCustomer(userId);

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

  private static async createKycLinkForUser(
    userId: string,
    params: CreateKycLinkParams,
    idempotencyKey: string,
  ): Promise<KycLinkResult> {
    const { type, fullName } = params;
    // Bridge 的 /kyc_links 將 email 列為必填
    const resolvedEmail = params.email ?? (await resolveUserEmail(userId)) ?? null;
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
      await ensureCustomerNamedPayout(userId);
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
      await clearStaleCustomer(userId);

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
      await ensureCustomerNamedPayout(userId);
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
      await ensureCustomerNamedPayout(existing.userId);
    }
  }

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
      await ensureCustomerNamedPayout(existing.userId);
    }
  }
}
