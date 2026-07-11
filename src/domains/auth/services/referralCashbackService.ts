import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../shared/lib/prisma';
import { logError } from '../../logger';

const DEFAULT_REFERRAL_CASHBACK_RATE = 0.1;
const DEFAULT_REFERRAL_CASHBACK_HOLD_DAYS = 14;

export interface AwardReferralCashbackParams {
  inviterUserId: string;
  referredUserId: string;
  source: string;
  eventType: string;
  /** 冪等 key，建議 `referral:${platformRecordIdempotencyKey}` */
  idempotencyKey: string;
  grossAmount: number;
  platformFee?: number | null;
  currency?: string;
  externalId?: string | null;
  stripeInvoiceId?: string | null;
  stripeChargeId?: string | null;
  stripeSubscriptionId?: string | null;
}

export class ReferralCashbackService {
  static getRate(): number {
    const configured = Number(process.env.REFERRAL_CASHBACK_RATE ?? DEFAULT_REFERRAL_CASHBACK_RATE);
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_REFERRAL_CASHBACK_RATE;
    }
    return configured;
  }

  static getHoldDays(): number {
    const configured = Number(
      process.env.REFERRAL_CASHBACK_HOLD_DAYS ?? DEFAULT_REFERRAL_CASHBACK_HOLD_DAYS,
    );
    if (!Number.isFinite(configured) || configured < 0) {
      return DEFAULT_REFERRAL_CASHBACK_HOLD_DAYS;
    }
    return Math.floor(configured);
  }

  /**
   * Refer 返現基數：優先 platformFee；Stripe 訂閱可 fallback 至 gross。
   */
  static resolveCashbackBase(
    source: string,
    platformFee: number | null | undefined,
    grossAmount: number | null | undefined,
  ): number | null {
    if (platformFee != null && platformFee > 0) {
      return Number(platformFee.toFixed(2));
    }
    if (source === 'stripe' && grossAmount != null && grossAmount > 0) {
      return Number(grossAmount.toFixed(2));
    }
    return null;
  }

  static async award(params: AwardReferralCashbackParams): Promise<void> {
    if (params.inviterUserId === params.referredUserId) return;

    const base = this.resolveCashbackBase(params.source, params.platformFee, params.grossAmount);
    if (base == null || base <= 0) return;

    const cashbackAmount = Number((base * this.getRate()).toFixed(2));
    if (cashbackAmount <= 0) return;

    const availableAt = new Date();
    availableAt.setDate(availableAt.getDate() + this.getHoldDays());

    try {
      await prisma.referralCashback.create({
        data: {
          inviterUserId: params.inviterUserId,
          referredUserId: params.referredUserId,
          source: params.source,
          eventType: params.eventType,
          idempotencyKey: params.idempotencyKey,
          externalId: params.externalId ?? null,
          stripeInvoiceId: params.stripeInvoiceId ?? null,
          stripeChargeId: params.stripeChargeId ?? null,
          stripeSubscriptionId: params.stripeSubscriptionId ?? null,
          grossAmount: base,
          cashbackAmount,
          currency: (params.currency ?? 'usd').toLowerCase(),
          status: 'pending',
          availableAt,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  /** PlatformRecord 寫入成功後，對 referrable 營收發放 pending 返現。 */
  static async awardFromPlatformRecord(input: {
    userId: string | null | undefined;
    inviterUserId: string | null;
    source: string;
    eventType: string;
    idempotencyKey: string;
    processAmount?: number | null;
    platformFee?: number | null;
    currency?: string;
    externalId?: string | null;
    referrable: boolean;
    stripeInvoiceId?: string | null;
    stripeChargeId?: string | null;
    stripeSubscriptionId?: string | null;
  }): Promise<void> {
    if (!input.referrable || !input.userId || !input.inviterUserId) return;

    try {
      await this.award({
        inviterUserId: input.inviterUserId,
        referredUserId: input.userId,
        source: input.source,
        eventType: input.eventType,
        idempotencyKey: `referral:${input.idempotencyKey}`,
        grossAmount: input.processAmount ?? 0,
        platformFee: input.platformFee ?? null,
        currency: input.currency ?? 'usd',
        externalId: input.externalId ?? null,
        stripeInvoiceId: input.stripeInvoiceId ?? null,
        stripeChargeId: input.stripeChargeId ?? null,
        stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      });
    } catch (error) {
      logError('[ReferralCashbackService] Failed to award from platform record', error as Error, {
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
      });
    }
  }

  static async settlePending(): Promise<void> {
    const now = new Date();
    const dueCashbacks = await prisma.referralCashback.findMany({
      where: {
        status: 'pending',
        availableAt: { lte: now },
      },
      select: {
        id: true,
        inviterUserId: true,
        cashbackAmount: true,
      },
      take: 200,
    });

    for (const cashback of dueCashbacks) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.referralCashback.updateMany({
          where: { id: cashback.id, status: 'pending' },
          data: { status: 'available', settledAt: now },
        });

        if (updated.count === 0) return;

        await tx.user.update({
          where: { id: cashback.inviterUserId },
          data: { cashbackBalance: { increment: cashback.cashbackAmount } },
        });
      });
    }
  }

  /** PlatformRecord 的 idempotencyKey（不含 referral: 前綴）→ 沖銷對應 ReferralCashback。 */
  static async reverseByIdempotencyKey(
    platformIdempotencyKey: string,
    reason: string,
    eventId: string,
  ): Promise<void> {
    const idempotencyKey = platformIdempotencyKey.startsWith('referral:')
      ? platformIdempotencyKey
      : `referral:${platformIdempotencyKey}`;

    const cashback = await prisma.referralCashback.findUnique({
      where: { idempotencyKey },
      select: {
        id: true,
        inviterUserId: true,
        cashbackAmount: true,
        status: true,
      },
    });

    await this.reverseCashback(cashback, reason, eventId);
  }

  static async reverseByStripeTarget(
    target: { stripeInvoiceId?: string; stripeChargeId?: string },
    reason: string,
    eventId: string,
  ): Promise<void> {
    if (!target.stripeInvoiceId && !target.stripeChargeId) return;

    const cashback = await prisma.referralCashback.findFirst({
      where: {
        OR: [
          ...(target.stripeInvoiceId ? [{ stripeInvoiceId: target.stripeInvoiceId }] : []),
          ...(target.stripeChargeId ? [{ stripeChargeId: target.stripeChargeId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        inviterUserId: true,
        cashbackAmount: true,
        status: true,
      },
    });

    await this.reverseCashback(cashback, reason, eventId);
  }

  private static async reverseCashback(
    cashback: {
      id: string;
      inviterUserId: string;
      cashbackAmount: number;
      status: string;
    } | null,
    reason: string,
    eventId: string,
  ): Promise<void> {
    if (!cashback || cashback.status === 'reversed') return;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.referralCashback.updateMany({
        where: { id: cashback.id, status: cashback.status },
        data: {
          status: 'reversed',
          reversedAt: new Date(),
          reverseReason: reason,
          reversedByEventId: eventId,
        },
      });

      if (updated.count === 0) return;

      if (cashback.status === 'available') {
        await tx.user.update({
          where: { id: cashback.inviterUserId },
          data: { cashbackBalance: { decrement: cashback.cashbackAmount } },
        });
      }
    });
  }
}
