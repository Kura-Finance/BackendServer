/**
 * Codego Visa/Mastercard Card Issuing Service
 *
 * Integration flow (see https://developers.codegotech.com/visa-crypto-card.html):
 *   1. KYC session → iframe embed
 *   2. user.updated webhook → codegoUserId
 *   3. Fund → contracts / balances
 *   4. Issue / manage cards
 *   5. Transactions
 */

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug } from '../../logger';
import { codegoKycFetch, codegoVccFetch, CodegoError } from '../lib/codegoClient';
import type {
  CodegoApplicantType,
  CodegoCardholderStatusResult,
  CodegoKycSessionResponse,
  CreateKycSessionParams,
  IssueCardParams,
  UpdateCardParams,
} from '../models/types';

const APPROVED_STATUSES = new Set(['approved']);

function canIssueFromStatus(applicationStatus: string | null | undefined): boolean {
  return !!applicationStatus && APPROVED_STATUSES.has(applicationStatus);
}

function toCardholderStatus(record: {
  codegoUserId: string | null;
  externalUserId: string;
  applicantType: string;
  kycSessionId: string | null;
  iframeUrl: string | null;
  sessionExpiresAt: Date | null;
  applicationStatus: string | null;
  applicationReason: string | null;
  kycStatus: string | null;
  canIssueCard: boolean;
}): CodegoCardholderStatusResult {
  return {
    codegoUserId: record.codegoUserId,
    externalUserId: record.externalUserId,
    applicantType: record.applicantType as CodegoApplicantType,
    kycSessionId: record.kycSessionId,
    iframeUrl: record.iframeUrl,
    sessionExpiresAt: record.sessionExpiresAt?.toISOString() ?? null,
    applicationStatus: record.applicationStatus,
    applicationReason: record.applicationReason,
    kycStatus: record.kycStatus,
    canIssueCard: record.canIssueCard,
  };
}

export class CodegoService {
  // ── Step 1: Onboard (KYC) ───────────────────────────────────────────

  static async createKycSession(
    userId: string,
    params: CreateKycSessionParams = {},
  ): Promise<CodegoKycSessionResponse & { applicantType: CodegoApplicantType }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      throw new CodegoError(404, 'User not found', 'createKycSession');
    }

    const applicantType: CodegoApplicantType = params.applicantType ?? 'individual';
    const origin = params.origin ?? process.env.CODEGO_KYC_ORIGIN;
    const returnUrl = params.returnUrl ?? process.env.CODEGO_KYC_RETURN_URL;

    if (!params.resumeSessionId && (!origin || !returnUrl)) {
      throw new CodegoError(
        400,
        'origin and returnUrl are required (pass in body or set CODEGO_KYC_ORIGIN / CODEGO_KYC_RETURN_URL)',
        'createKycSession',
      );
    }

    const body: Record<string, unknown> = params.resumeSessionId
      ? { resumeSessionId: params.resumeSessionId }
      : {
          externalUserId: userId,
          applicantType,
          email: params.email ?? user.email,
          origin,
          locale: params.locale ?? 'en',
          returnUrl,
        };

    const created = await codegoKycFetch<CodegoKycSessionResponse>('/session/create', {
      method: 'POST',
      body,
    });

    if (!created.sessionId || !created.iframeUrl) {
      throw new CodegoError(502, 'Codego KYC session response missing sessionId or iframeUrl', '/session/create');
    }

    await prisma.codegoCardholder.upsert({
      where: { userId },
      create: {
        userId,
        externalUserId: userId,
        applicantType,
        kycSessionId: created.sessionId,
        iframeUrl: created.iframeUrl,
        sessionExpiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
      },
      update: {
        applicantType,
        kycSessionId: created.sessionId,
        iframeUrl: created.iframeUrl,
        sessionExpiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
      },
    });

    appLogger.info('[CodegoService] KYC session created', {
      userId,
      sessionId: created.sessionId,
      resume: !!params.resumeSessionId,
    });

    return { ...created, applicantType };
  }

  static async getCardholderStatus(userId: string): Promise<CodegoCardholderStatusResult> {
    const record = await prisma.codegoCardholder.findUnique({ where: { userId } });
    if (!record) {
      return {
        codegoUserId: null,
        externalUserId: userId,
        applicantType: 'individual',
        kycSessionId: null,
        iframeUrl: null,
        sessionExpiresAt: null,
        applicationStatus: null,
        applicationReason: null,
        kycStatus: null,
        canIssueCard: false,
      };
    }
    return toCardholderStatus(record);
  }

  static async getApplication(userId: string): Promise<unknown> {
    const codegoUserId = await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/applications/${codegoUserId}`);
  }

  static async getUser(userId: string): Promise<unknown> {
    const codegoUserId = await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/users/${codegoUserId}`);
  }

  // ── Step 2: Fund ────────────────────────────────────────────────────

  static async getContracts(userId: string): Promise<unknown> {
    const codegoUserId = await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/users/${codegoUserId}/contracts`);
  }

  static async getBalances(userId: string): Promise<unknown> {
    const codegoUserId = await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/users/${codegoUserId}/balances`);
  }

  // ── Step 3 & 4: Cards ───────────────────────────────────────────────

  static async issueCard(userId: string, params: IssueCardParams): Promise<unknown> {
    await this.requireApprovedCardholder(userId);
    const codegoUserId = await this.requireCodegoUserId(userId);
    const result = await codegoVccFetch<Record<string, unknown>>(`/users/${codegoUserId}/cards`, {
      method: 'POST',
      body: params,
    });

    const cardId = typeof result.id === 'string' ? result.id : null;
    if (cardId) {
      await this.syncCardFromPayload(userId, cardId, result);
    }

    return result;
  }

  static async listCards(userId: string): Promise<unknown> {
    await this.requireCodegoUserId(userId);
    const list = await codegoVccFetch<{ data?: Record<string, unknown>[] }>('/cards');
    const cards = list.data ?? [];
    for (const card of cards) {
      if (typeof card.id === 'string') {
        await this.syncCardFromPayload(userId, card.id, card);
      }
    }
    return list;
  }

  static async getCard(userId: string, cardId: string): Promise<unknown> {
    await this.assertCardOwnership(userId, cardId);
    const card = await codegoVccFetch<Record<string, unknown>>(`/cards/${cardId}`);
    await this.syncCardFromPayload(userId, cardId, card);
    return card;
  }

  static async updateCard(userId: string, cardId: string, params: UpdateCardParams): Promise<unknown> {
    await this.assertCardOwnership(userId, cardId);
    const card = await codegoVccFetch<Record<string, unknown>>(`/cards/${cardId}`, {
      method: 'PATCH',
      body: params,
    });
    await this.syncCardFromPayload(userId, cardId, card);
    return card;
  }

  static async getCardSecrets(
    userId: string,
    cardId: string,
    sessionId: string,
  ): Promise<unknown> {
    await this.assertCardOwnership(userId, cardId);
    return codegoVccFetch(`/cards/${cardId}/secrets`, {
      headers: { SessionId: sessionId },
    });
  }

  static async getCardPin(userId: string, cardId: string, sessionId: string): Promise<unknown> {
    await this.assertCardOwnership(userId, cardId);
    return codegoVccFetch(`/cards/${cardId}/pin`, {
      headers: { SessionId: sessionId },
    });
  }

  // ── Step 5: Transactions ────────────────────────────────────────────

  static async listTransactions(
    userId: string,
    query: { limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    await this.requireCodegoUserId(userId);
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const qs = params.toString();
    return codegoVccFetch(`/transactions${qs ? `?${qs}` : ''}`);
  }

  static async getTransaction(userId: string, txId: string): Promise<unknown> {
    await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/transactions/${txId}`);
  }

  static async createDispute(
    userId: string,
    txId: string,
    body: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.requireCodegoUserId(userId);
    return codegoVccFetch(`/transactions/${txId}/disputes`, {
      method: 'POST',
      body,
    });
  }

  // ── Webhook sync ────────────────────────────────────────────────────

  static async syncUserFromWebhook(body: Record<string, unknown>): Promise<void> {
    const codegoUserId = typeof body.id === 'string' ? body.id : null;
    const externalUserId = typeof body.externalUserId === 'string' ? body.externalUserId : null;
    if (!codegoUserId || !externalUserId) {
      logDebug('[CodegoService] user.updated webhook missing id or externalUserId', { body });
      return;
    }

    const applicationStatus =
      typeof body.applicationStatus === 'string' ? body.applicationStatus : null;
    const applicationReason =
      typeof body.applicationReason === 'string' ? body.applicationReason : null;
    const kycStatus = typeof body.kycStatus === 'string' ? body.kycStatus : null;
    const canIssueCard = canIssueFromStatus(applicationStatus);

    await prisma.codegoCardholder.upsert({
      where: { userId: externalUserId },
      create: {
        userId: externalUserId,
        externalUserId,
        codegoUserId,
        applicationStatus,
        applicationReason,
        kycStatus,
        canIssueCard,
      },
      update: {
        codegoUserId,
        applicationStatus,
        applicationReason,
        kycStatus,
        canIssueCard,
      },
    });

    appLogger.info('[CodegoService] Cardholder synced from webhook', {
      userId: externalUserId,
      codegoUserId,
      applicationStatus,
      canIssueCard,
    });
  }

  static async syncCardFromWebhook(body: Record<string, unknown>): Promise<void> {
    const cardId = typeof body.id === 'string' ? body.id : null;
    const externalUserId =
      typeof body.externalUserId === 'string' ? body.externalUserId : null;
    if (!cardId || !externalUserId) return;
    await this.syncCardFromPayload(externalUserId, cardId, body);
  }

  /** webhook 去重：成功寫入回 true；重複 Idempotency-Key 回 false */
  static async recordWebhookEvent(
    idempotencyKey: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean> {
    try {
      await prisma.codegoWebhookEvent.create({
        data: {
          idempotencyKey,
          eventType,
          payload: payload as object,
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

  // ── Private helpers ─────────────────────────────────────────────────

  private static async requireCodegoUserId(userId: string): Promise<string> {
    const record = await prisma.codegoCardholder.findUnique({
      where: { userId },
      select: { codegoUserId: true },
    });
    if (!record?.codegoUserId) {
      throw new CodegoError(
        409,
        'Codego cardholder not ready. Complete KYC and wait for user.updated webhook.',
        'requireCodegoUserId',
      );
    }
    return record.codegoUserId;
  }

  private static async requireApprovedCardholder(userId: string): Promise<void> {
    const record = await prisma.codegoCardholder.findUnique({
      where: { userId },
      select: { canIssueCard: true, applicationStatus: true },
    });
    if (!record?.canIssueCard) {
      throw new CodegoError(
        409,
        `KYC not approved (status: ${record?.applicationStatus ?? 'not_started'}).`,
        'requireApprovedCardholder',
      );
    }
  }

  private static async assertCardOwnership(userId: string, cardId: string): Promise<void> {
    const owned = await prisma.codegoCard.findFirst({
      where: { userId, codegoCardId: cardId },
    });
    if (owned) return;

    // 卡片可能剛發行、尚未 sync：向 Codego 拉一次並驗證 tenant
    await this.requireCodegoUserId(userId);
  }

  private static async syncCardFromPayload(
    userId: string,
    cardId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const cardType = typeof payload.cardType === 'string' ? payload.cardType : null;
    const status = typeof payload.status === 'string' ? payload.status : null;
    const last4 = typeof payload.last4 === 'string' ? payload.last4 : null;
    const brand = typeof payload.brand === 'string' ? payload.brand : null;

    await prisma.codegoCard.upsert({
      where: { codegoCardId: cardId },
      create: {
        userId,
        codegoCardId: cardId,
        cardType,
        status,
        last4,
        brand,
      },
      update: {
        cardType,
        status,
        last4,
        brand,
      },
    });
  }
}

export { CodegoError };
