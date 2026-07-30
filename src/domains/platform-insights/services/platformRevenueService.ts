/**
 * PlatformRecord write path + Investor summary aggregation.
 * Idempotent ingest from Stripe, Bridge, Dinari, LI.FI, Privy, waitlist, etc.
 */

import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type Stripe from 'stripe';
import type { BridgeDrainResponse } from '../../bridge/models/types';
import { prisma } from '../../shared/lib/prisma';
import { appLogger } from '../../logger';
import { ReferralCashbackService } from '../../auth/services/referralCashbackService';
import type {
  InvestorSummary,
  PlatformRevenueProductLine,
  PlatformRevenueSummary,
  RecordPlatformRecordInput,
} from '../models/types';
import { REFERRABLE_REVENUE_SOURCES } from '../models/types';
import { fetchEarnManagedAssets } from '../lib/morphoEarn';
import {
  BRIDGE_PLATFORM_FEE_BPS,
  BRIDGE_PLATFORM_FEE_RATE,
  CARD_PLATFORM_FEE_BPS,
  DINARI_PLATFORM_FEE_BPS,
  DINARI_PLATFORM_FEE_RATE,
  EARN_PERFORMANCE_FEE_BPS,
  SWAP_PLATFORM_FEE_BPS,
  SWAP_PLATFORM_FEE_RATE,
  isBridgeRevenueSource,
  isCardRevenueSource,
  isDinariRevenueSource,
  isStripeRevenueSource,
  isSwapRevenueSource,
  platformFeeFromProcess,
  roundUsd,
} from '../lib/revenuePolicy';
import {
  buildLazySkip,
  getPlatformBackfillMinIntervalMs,
  isWithinInterval,
  type LazyUpdateSkipped,
} from '../../shared/lib/lazyUpdate';

function parseDecimal(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultPeriod(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

function extractStripeChargeId(invoice: Stripe.Invoice): string | null {
  const invoiceCharge = (invoice as { charge?: string | { id?: string } | null }).charge;
  if (!invoiceCharge) return null;
  return typeof invoiceCharge === 'string' ? invoiceCharge : invoiceCharge.id ?? null;
}

/** Investor accounting fee for a revenue event (policy rates, not Bridge wholesale). */
function investorFeeForEvent(source: string, processAmount: number | null | undefined): number {
  if (isBridgeRevenueSource(source)) {
    return platformFeeFromProcess(processAmount, BRIDGE_PLATFORM_FEE_RATE);
  }
  if (isSwapRevenueSource(source)) {
    return platformFeeFromProcess(processAmount, SWAP_PLATFORM_FEE_RATE);
  }
  if (isDinariRevenueSource(source) || isCardRevenueSource(source)) {
    return 0;
  }
  if (isStripeRevenueSource(source)) {
    // Subscriptions: full paid amount is platform AR.
    return processAmount != null && Number.isFinite(processAmount) ? roundUsd(processAmount) : 0;
  }
  return 0;
}

function emptyProductLine(
  key: PlatformRevenueProductLine['key'],
  label: string,
  rateBps: number | null,
  status: PlatformRevenueProductLine['status'],
): PlatformRevenueProductLine {
  return {
    key,
    label,
    processUsd: 0,
    revenueUsd: 0,
    rateBps,
    count: 0,
    status,
  };
}

/** Dinari on-chain / order-request filled statuses (case-insensitive). */
const DINARI_FILLED_STATUSES = new Set([
  'filled',
  'completed',
  'settled',
  'executed',
  'done',
]);

/** Dinari cancelled / terminal failure statuses (case-insensitive). */
const DINARI_CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'expired',
  'rejected',
  'error',
  'failed',
  'voided',
  'refunded',
]);

/** True if Dinari status is a filled/settled terminal state. */
export function isDinariOrderFilled(status: string | null | undefined): boolean {
  if (!status) return false;
  return DINARI_FILLED_STATUSES.has(status.trim().toLowerCase());
}

/** True if Dinari status is cancelled or otherwise terminal-failed. */
export function isDinariOrderCancelled(status: string | null | undefined): boolean {
  if (!status) return false;
  return DINARI_CANCELLED_STATUSES.has(status.trim().toLowerCase());
}

function resolveReferrable(input: RecordPlatformRecordInput): boolean {
  if (input.referrable !== undefined) return input.referrable;
  const category = input.category ?? 'revenue';
  return category === 'revenue' && REFERRABLE_REVENUE_SOURCES.has(input.source);
}

async function resolveInviterUserId(
  userId: string | null | undefined,
  explicit: string | null | undefined,
): Promise<string | null> {
  if (explicit !== undefined) return explicit;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredByUserId: true },
  });
  return user?.referredByUserId ?? null;
}

function buildRecordMetadata(
  input: RecordPlatformRecordInput,
  referrable: boolean,
  inviterUserId: string | null,
): Record<string, unknown> | undefined {
  const base = { ...(input.metadata ?? {}) };
  const category = input.category ?? 'revenue';
  if (category !== 'revenue') {
    return Object.keys(base).length > 0 ? base : undefined;
  }
  return {
    ...base,
    referrable,
    inviterUserId,
  };
}

export class PlatformRecordService {
  /** Idempotent PlatformRecord write (unified Investor DB). */
  static async record(input: RecordPlatformRecordInput): Promise<void> {
    const referrable = resolveReferrable(input);
    const inviterUserId = referrable
      ? await resolveInviterUserId(input.userId, input.inviterUserId)
      : null;
    const metadata = buildRecordMetadata(input, referrable, inviterUserId);

    const data = {
      category: input.category ?? 'revenue',
      userId: input.userId ?? null,
      source: input.source,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      email: input.email ?? null,
      product: input.product ?? null,
      processAmount: input.processAmount ?? null,
      platformFee: input.platformFee ?? null,
      netAmount: input.netAmount ?? null,
      currency: (input.currency ?? 'usd').toLowerCase(),
      externalId: input.externalId ?? null,
      depositId: input.depositId ?? null,
      scaAddress: input.scaAddress?.toLowerCase() ?? null,
      occurredAt: input.occurredAt,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    };

    try {
      await prisma.platformRecord.create({ data });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        // Idempotent retry / backfill: refresh amounts; do not re-award Refer cashback.
        await prisma.platformRecord.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: {
            processAmount: data.processAmount,
            platformFee: data.platformFee,
            netAmount: data.netAmount,
            ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
          },
        });
        return;
      }
      throw error;
    }

    if (referrable && inviterUserId && input.userId) {
      await ReferralCashbackService.awardFromPlatformRecord({
        userId: input.userId,
        inviterUserId,
        source: input.source,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        processAmount: input.processAmount ?? null,
        platformFee: input.platformFee ?? null,
        currency: input.currency ?? 'usd',
        externalId: input.externalId ?? null,
        referrable: true,
        stripeInvoiceId: input.referralContext?.stripeInvoiceId ?? null,
        stripeChargeId: input.referralContext?.stripeChargeId ?? null,
        stripeSubscriptionId: input.referralContext?.stripeSubscriptionId ?? null,
      });
    }
  }

  static async recordFromStripeInvoice(
    userId: string,
    invoice: Stripe.Invoice,
    subscriptionId?: string,
  ): Promise<void> {
    const invoiceId = invoice.id;
    if (!invoiceId) return;

    const amountPaidCents = invoice.amount_paid || 0;
    if (amountPaidCents <= 0) return;

    const processAmount = roundUsd(amountPaidCents / 100);
    const occurredAt = invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date();

    await this.record({
      category: 'revenue',
      userId,
      source: 'stripe',
      eventType: 'invoice_paid',
      idempotencyKey: `stripe:invoice:${invoiceId}`,
      processAmount,
      platformFee: processAmount,
      netAmount: processAmount,
      currency: invoice.currency || 'usd',
      externalId: invoiceId,
      occurredAt,
      referralContext: {
        stripeInvoiceId: invoiceId,
        stripeChargeId: extractStripeChargeId(invoice),
        stripeSubscriptionId: subscriptionId ?? null,
      },
      metadata: {
        stripeSubscriptionId: subscriptionId ?? null,
        billingReason: invoice.billing_reason ?? null,
      },
    });
  }

  static async recordFromBridgeVaActivity(params: {
    userId: string;
    bridgeEventId: string;
    eventType: string;
    amount?: string | null;
    currency?: string | null;
    developerFeeAmount?: string | null;
    subtotalAmount?: string | null;
    depositId?: string | null;
    bridgeVirtualAccountId: string;
    occurredAt?: Date | null;
  }): Promise<void> {
    if (params.eventType !== 'payment_processed') return;

    const processAmount = parseDecimal(params.amount);
    // Investor / Refer: Kura margin only (0.25% of process), not Bridge wholesale+margin.
    const platformFee = platformFeeFromProcess(processAmount, BRIDGE_PLATFORM_FEE_RATE);

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { scaAddress: true },
    });

    await this.record({
      category: 'revenue',
      userId: params.userId,
      source: 'bridge_va',
      eventType: 'payment_processed',
      idempotencyKey: `bridge:va:${params.bridgeEventId}`,
      processAmount,
      platformFee,
      netAmount: platformFee,
      currency: params.currency ?? 'usd',
      externalId: params.bridgeEventId,
      depositId: params.depositId ?? null,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: params.occurredAt ?? new Date(),
      metadata: {
        bridgeVirtualAccountId: params.bridgeVirtualAccountId,
        developerFeeAmount: params.developerFeeAmount ?? null,
        ...(params.subtotalAmount ? { subtotalAmount: params.subtotalAmount } : {}),
        platformFeeRateBps: BRIDGE_PLATFORM_FEE_BPS,
      },
    });
  }

  static async recordFromBridgeLiquidationDrain(drain: BridgeDrainResponse): Promise<void> {
    if (!drain.id || drain.state !== 'payment_processed') return;
    const laId = drain.liquidation_address_id;
    if (!laId) return;

    const la = await prisma.bridgeLiquidationAddress.findUnique({
      where: { bridgeLiquidationAddressId: laId },
      select: {
        userId: true,
        direction: true,
        sourceChain: true,
        sourceCurrency: true,
        destinationCurrency: true,
        destinationRail: true,
        developerFeePercent: true,
      },
    });

    const userId = la?.userId;
    if (!userId) return;

    const source =
      la.direction === 'in' ? 'bridge_liquidation_in' : 'bridge_liquidation_out';
    const processAmount = parseDecimal(drain.amount);
    const chargedDeveloperFeePercent = la.developerFeePercent ?? null;
    const platformFee = platformFeeFromProcess(processAmount, BRIDGE_PLATFORM_FEE_RATE);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { scaAddress: true },
    });

    await this.record({
      category: 'revenue',
      userId,
      source,
      eventType: 'payment_processed',
      idempotencyKey: `bridge:liquidation:${drain.id}:payment_processed`,
      processAmount,
      platformFee,
      netAmount: platformFee,
      currency: drain.currency ?? la.sourceCurrency ?? la.destinationCurrency ?? 'usd',
      externalId: drain.id,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: drain.created_at ? new Date(drain.created_at) : new Date(),
      metadata: {
        liquidationAddressId: laId,
        depositTxHash: drain.deposit_tx_hash ?? null,
        destinationTxHash: drain.destination_tx_hash ?? null,
        destination: drain.destination ?? null,
        direction: la.direction,
        chargedDeveloperFeePercent,
        platformFeeRateBps: BRIDGE_PLATFORM_FEE_BPS,
        route:
          la.direction === 'in'
            ? {
                sourceChain: la.sourceChain,
                sourceCurrency: la.sourceCurrency,
                destinationCurrency: la.destinationCurrency,
              }
            : {
                destinationRail: la.destinationRail,
                destinationCurrency: la.destinationCurrency,
              },
      },
    });
  }

  static async recordFromBridgeTransfer(bridgeTransferId: string): Promise<void> {
    const transfer = await prisma.bridgeTransfer.findUnique({
      where: { bridgeTransferId },
    });
    if (!transfer || transfer.state !== 'payment_processed') return;

    const processAmount = parseDecimal(transfer.amount);
    const platformFee = platformFeeFromProcess(processAmount, BRIDGE_PLATFORM_FEE_RATE);
    const user = await prisma.user.findUnique({
      where: { id: transfer.userId },
      select: { scaAddress: true },
    });

    await this.record({
      category: 'revenue',
      userId: transfer.userId,
      source: 'bridge_transfer',
      eventType: 'payment_processed',
      idempotencyKey: `bridge:transfer:${bridgeTransferId}:payment_processed`,
      processAmount,
      platformFee,
      netAmount: platformFee,
      currency: transfer.sourceCurrency ?? transfer.destinationCurrency ?? 'usd',
      externalId: bridgeTransferId,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: transfer.updatedAt,
      metadata: {
        direction: transfer.direction,
        sourceRail: transfer.sourceRail,
        destinationRail: transfer.destinationRail,
        developerFee: transfer.developerFee,
        platformFeeRateBps: BRIDGE_PLATFORM_FEE_BPS,
      },
    });
  }

  /** LI.FI DONE transfer → Investor process volume; platform fee = process × 0.25%. */
  static async recordFromLifiTransfer(params: {
    userId: string | null;
    scaAddress: string | null;
    idempotencyKey: string;
    externalId: string | null;
    processAmount: number;
    platformFee: number | null;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const platformFee = platformFeeFromProcess(params.processAmount, SWAP_PLATFORM_FEE_RATE);
    await this.record({
      category: 'revenue',
      userId: params.userId,
      source: 'lifi',
      eventType: 'transfer_done',
      idempotencyKey: params.idempotencyKey,
      processAmount: params.processAmount,
      platformFee,
      netAmount: platformFee,
      currency: 'usd',
      externalId: params.externalId,
      scaAddress: params.scaAddress,
      occurredAt: params.occurredAt,
      referrable: false,
      metadata: {
        ...(params.metadata ?? {}),
        reportedIntegratorFeeUsd: params.platformFee,
        platformFeeRateBps: SWAP_PLATFORM_FEE_BPS,
      },
    });
  }

  static async recordFromDinariOrder(order: {
    userId: string;
    orderRequestId: string;
    orderId: string | null;
    status: string;
    side: string;
    type: string;
    stockId: string | null;
    paymentTokenQuantity: string | null;
    assetTokenQuantity: string | null;
    limitPrice: string | null;
    updatedAt: Date;
  }): Promise<void> {
    if (!isDinariOrderFilled(order.status)) return;

    const processAmount =
      parseDecimal(order.paymentTokenQuantity) ??
      (() => {
        const qty = parseDecimal(order.assetTokenQuantity);
        const price = parseDecimal(order.limitPrice);
        if (qty == null || price == null) return qty;
        return roundUsd(qty * price);
      })();

    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { scaAddress: true },
    });

    const externalId = order.orderId ?? order.orderRequestId;

    await this.record({
      category: 'revenue',
      userId: order.userId,
      source: 'dinari',
      eventType: 'order_filled',
      idempotencyKey: `dinari:order:${order.orderRequestId}:filled`,
      processAmount,
      // Dinari temporarily $0 platform fee (volume still tracked as processAmount).
      platformFee: platformFeeFromProcess(processAmount, DINARI_PLATFORM_FEE_RATE),
      netAmount: platformFeeFromProcess(processAmount, DINARI_PLATFORM_FEE_RATE),
      currency: 'usd',
      externalId,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: order.updatedAt,
      metadata: {
        orderRequestId: order.orderRequestId,
        orderId: order.orderId,
        side: order.side,
        type: order.type,
        stockId: order.stockId,
        status: order.status,
        paymentTokenQuantity: order.paymentTokenQuantity,
        assetTokenQuantity: order.assetTokenQuantity,
        limitPrice: order.limitPrice,
        platformFeeRateBps: DINARI_PLATFORM_FEE_BPS,
      },
    });
  }

  static async recordFromWaitlistEntry(params: {
    waitlistEntryId: string;
    email: string;
    product: string;
    source?: string | null;
    name?: string | null;
    occurredAt: Date;
    alreadyJoined?: boolean;
  }): Promise<void> {
    await this.record({
      category: 'waitlist',
      source: 'waitlist',
      eventType: params.alreadyJoined ? 'waitlist_existing' : 'waitlist_joined',
      idempotencyKey: `waitlist:${params.product}:${params.email}`,
      email: params.email,
      product: params.product,
      externalId: params.waitlistEntryId,
      occurredAt: params.occurredAt,
      metadata: {
        landingSource: params.source ?? null,
        name: params.name ?? null,
      },
    });
  }

  static async recordFromPrivyMetrics(params: {
    syncRunId: string;
    totalUsers: number;
    activeUsers: number;
    periodFrom: Date;
    periodTo: Date;
    syncedAt: Date;
  }): Promise<void> {
    await this.record({
      category: 'active_users',
      source: 'privy',
      eventType: 'privy_metrics_snapshot',
      idempotencyKey: `privy:metrics:${params.syncRunId}`,
      processAmount: params.activeUsers,
      netAmount: params.totalUsers,
      currency: 'count',
      externalId: params.syncRunId,
      occurredAt: params.syncedAt,
      metadata: {
        totalUsers: params.totalUsers,
        activeUsers: params.activeUsers,
        periodFrom: params.periodFrom.toISOString(),
        periodTo: params.periodTo.toISOString(),
      },
    });
  }

  static async needsPlatformBackfill(): Promise<boolean> {
    const [
      latestVa,
      latestTransfer,
      latestStripeEvent,
      latestWaitlist,
      latestDinariOrder,
    ] = await Promise.all([
      prisma.bridgeVirtualAccountEvent.findFirst({
        where: { type: 'payment_processed' },
        orderBy: { createdAt: 'desc' },
        select: { bridgeEventId: true },
      }),
      prisma.bridgeTransfer.findFirst({
        where: { state: 'payment_processed' },
        orderBy: { updatedAt: 'desc' },
        select: { bridgeTransferId: true },
      }),
      prisma.stripeWebhookEvent.findFirst({
        where: { type: 'invoice.paid' },
        orderBy: { createdAt: 'desc' },
        select: { payload: true },
      }),
      prisma.waitlistEntry.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, product: true },
      }),
      prisma.dinariOrder.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { orderRequestId: true, status: true },
      }),
    ]);

    const keys: string[] = [];
    if (latestVa) keys.push(`bridge:va:${latestVa.bridgeEventId}`);
    if (latestTransfer) {
      keys.push(`bridge:transfer:${latestTransfer.bridgeTransferId}:payment_processed`);
    }
    if (latestStripeEvent?.payload) {
      const payload = latestStripeEvent.payload as unknown as Stripe.Invoice;
      if (payload.id) keys.push(`stripe:invoice:${payload.id}`);
    }
    if (latestWaitlist) {
      keys.push(`waitlist:${latestWaitlist.product}:${latestWaitlist.email}`);
    }
    if (latestDinariOrder && isDinariOrderFilled(latestDinariOrder.status)) {
      keys.push(`dinari:order:${latestDinariOrder.orderRequestId}:filled`);
    }

    if (keys.length === 0) return false;

    const existing = await prisma.platformRecord.findMany({
      where: { idempotencyKey: { in: keys } },
      select: { idempotencyKey: true },
    });
    return existing.length < keys.length;
  }

  static async backfillFromExistingDataIfStale(options?: {
    force?: boolean;
  }): Promise<
    | LazyUpdateSkipped
    | { skipped: false; created: number; skippedCount: number; total: number }
  > {
    const minIntervalMs = getPlatformBackfillMinIntervalMs();

    if (!options?.force) {
      const [lastRecord, needsBackfill] = await Promise.all([
        prisma.platformRecord.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.needsPlatformBackfill(),
      ]);

      if (
        !needsBackfill &&
        isWithinInterval(lastRecord?.createdAt, minIntervalMs)
      ) {
        return buildLazySkip({
          reason: 'fresh',
          lastUpdatedAt: lastRecord?.createdAt ?? null,
          minIntervalMs,
        });
      }
    }

    const result = await this.backfillFromExistingData();
    return {
      skipped: false,
      created: result.created,
      skippedCount: result.skipped,
      total: result.skipped + result.created,
    };
  }

  static async backfillFromExistingData(): Promise<{ created: number; skipped: number }> {
    // Repair historical Dinari rows that stored fill notional as net revenue.
    await prisma.platformRecord.updateMany({
      where: {
        category: 'revenue',
        source: 'dinari',
        eventType: 'order_filled',
      },
      data: {
        platformFee: 0,
        netAmount: 0,
      },
    });

    const before = await prisma.platformRecord.count();

    const vaEvents = await prisma.bridgeVirtualAccountEvent.findMany({
      where: { type: 'payment_processed' },
    });
    for (const event of vaEvents) {
      await this.recordFromBridgeVaActivity({
        userId: event.userId,
        bridgeEventId: event.bridgeEventId,
        eventType: event.type,
        amount: event.amount,
        currency: event.currency,
        developerFeeAmount: event.developerFeeAmount,
        subtotalAmount: event.subtotalAmount,
        depositId: event.depositId,
        bridgeVirtualAccountId: event.bridgeVirtualAccountId,
        occurredAt: event.occurredAt ?? event.createdAt,
      });
    }

    const transfers = await prisma.bridgeTransfer.findMany({
      where: { state: 'payment_processed' },
    });
    for (const transfer of transfers) {
      await this.recordFromBridgeTransfer(transfer.bridgeTransferId);
    }

    const stripeEvents = await prisma.stripeWebhookEvent.findMany({
      where: { type: 'invoice.paid' },
      orderBy: { createdAt: 'asc' },
    });
    for (const event of stripeEvents) {
      const payload = event.payload as Stripe.Invoice | null;
      if (!payload?.id) continue;
      const customerId =
        typeof payload.customer === 'string' ? payload.customer : payload.customer?.id;
      if (!customerId) continue;
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      if (!user) continue;
      const subRef = payload.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id;
      await this.recordFromStripeInvoice(user.id, payload, subscriptionId);
    }

    const waitlistEntries = await prisma.waitlistEntry.findMany();
    for (const entry of waitlistEntries) {
      await this.recordFromWaitlistEntry({
        waitlistEntryId: entry.id,
        email: entry.email,
        product: entry.product,
        source: entry.source,
        name: entry.name,
        occurredAt: entry.createdAt,
      });
    }

    const { LifiAnalyticsService } = await import(
      '../../lifi-analytics/services/lifiAnalyticsService'
    );
    await LifiAnalyticsService.syncForBackfill();

    const dinariOrders = await prisma.dinariOrder.findMany();
    for (const order of dinariOrders) {
      await this.recordFromDinariOrder(order);
    }

    const after = await prisma.platformRecord.count();
    appLogger.info('[PlatformRecordService] Backfill completed', {
      created: after - before,
      skipped: before,
      total: after,
    });
    return { created: after - before, skipped: before };
  }

  static async listRecords(options: {
    from?: string;
    to?: string;
    category?: string;
    source?: string;
    product?: string;
    limit?: number;
    offset?: number;
  }) {
    const period = defaultPeriod(options.from, options.to);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);

    return prisma.platformRecord.findMany({
      where: {
        occurredAt: { gte: period.from, lte: period.to },
        ...(options.category ? { category: options.category } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.product ? { product: options.product } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  static async countRecords(options: {
    from?: string;
    to?: string;
    category?: string;
    source?: string;
    product?: string;
  }) {
    const period = defaultPeriod(options.from, options.to);
    return prisma.platformRecord.count({
      where: {
        occurredAt: { gte: period.from, lte: period.to },
        ...(options.category ? { category: options.category } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.product ? { product: options.product } : {}),
      },
    });
  }

  static async getInvestorSummary(from?: string, to?: string): Promise<InvestorSummary> {
    const period = defaultPeriod(from, to);

    const revenueEvents = await prisma.platformRecord.findMany({
      where: {
        category: 'revenue',
        // Exclude LI.FI sync checkpoint (no process volume; omit from Investor counts).
        eventType: { not: 'lifi_transfers_synced' },
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: {
        source: true,
        processAmount: true,
        platformFee: true,
        netAmount: true,
      },
    });

    const bySource: InvestorSummary['process']['bySource'] = {};
    let totalProcessUsd = 0;

    const bridge = emptyProductLine('bridge', 'Crypto <> Fiat', BRIDGE_PLATFORM_FEE_BPS, 'active');
    const swap = emptyProductLine('swap', 'Swap', SWAP_PLATFORM_FEE_BPS, 'active');
    const dinari = emptyProductLine('dinari', 'US Stocks', DINARI_PLATFORM_FEE_BPS, 'zero_fee');
    const card = emptyProductLine('card', 'Card', CARD_PLATFORM_FEE_BPS, 'reserved');
    const subscriptions = emptyProductLine('subscriptions', 'Subscriptions', null, 'active');

    for (const event of revenueEvents) {
      const processAmount = event.processAmount ?? 0;
      // Recompute Investor fee from policy so historical wholesale fees cannot inflate revenue.
      const fee = investorFeeForEvent(event.source, processAmount);
      totalProcessUsd += processAmount;

      let bucket = bySource[event.source];
      if (!bucket) {
        bucket = { processUsd: 0, platformFeeUsd: 0, netUsd: 0, count: 0 };
        bySource[event.source] = bucket;
      }
      bucket.processUsd += processAmount;
      bucket.platformFeeUsd += fee;
      bucket.netUsd += fee;
      bucket.count += 1;

      if (isBridgeRevenueSource(event.source)) {
        bridge.processUsd += processAmount;
        bridge.revenueUsd += fee;
        bridge.count += 1;
      } else if (isSwapRevenueSource(event.source)) {
        swap.processUsd += processAmount;
        swap.revenueUsd += fee;
        swap.count += 1;
      } else if (isDinariRevenueSource(event.source)) {
        dinari.processUsd += processAmount;
        dinari.revenueUsd += fee;
        dinari.count += 1;
      } else if (isCardRevenueSource(event.source)) {
        card.processUsd += processAmount;
        card.revenueUsd += fee;
        card.count += 1;
        card.status = fee > 0 || processAmount > 0 ? 'active' : 'reserved';
      } else if (isStripeRevenueSource(event.source)) {
        subscriptions.processUsd += processAmount;
        subscriptions.revenueUsd += fee;
        subscriptions.count += 1;
      }
    }

    for (const key of Object.keys(bySource)) {
      const row = bySource[key];
      if (!row) continue;
      row.processUsd = roundUsd(row.processUsd);
      row.platformFeeUsd = roundUsd(row.platformFeeUsd);
      row.netUsd = roundUsd(row.netUsd);
    }

    bridge.processUsd = roundUsd(bridge.processUsd);
    bridge.revenueUsd = roundUsd(bridge.revenueUsd);
    swap.processUsd = roundUsd(swap.processUsd);
    swap.revenueUsd = roundUsd(swap.revenueUsd);
    dinari.processUsd = roundUsd(dinari.processUsd);
    dinari.revenueUsd = roundUsd(dinari.revenueUsd);
    card.processUsd = roundUsd(card.processUsd);
    card.revenueUsd = roundUsd(card.revenueUsd);
    subscriptions.processUsd = roundUsd(subscriptions.processUsd);
    subscriptions.revenueUsd = roundUsd(subscriptions.revenueUsd);

    const waitlistRows = await prisma.platformRecord.findMany({
      where: {
        category: 'waitlist',
        eventType: 'waitlist_joined',
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: { product: true },
    });
    const byProduct: Record<string, number> = {};
    for (const row of waitlistRows) {
      const product = row.product ?? 'default';
      byProduct[product] = (byProduct[product] ?? 0) + 1;
    }

    const activeSubscriptions = await prisma.stripeSubscription.findMany({
      where: { status: { in: ['active', 'trialing', 'past_due'] } },
      select: { status: true, user: { select: { tier: true } } },
    });

    const byTier: Record<string, number> = {};
    for (const sub of activeSubscriptions) {
      const tier = sub.user?.tier ?? 'Basic';
      byTier[tier] = (byTier[tier] ?? 0) + 1;
    }

    const [latestPrivyMetrics, earnAssets] = await Promise.all([
      prisma.platformRecord.findFirst({
        where: { category: 'active_users', eventType: 'privy_metrics_snapshot' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true, metadata: true },
      }),
      fetchEarnManagedAssets(),
    ]);

    if (earnAssets.error) {
      appLogger.warn('Investor Earn AUM fetch failed', { error: earnAssets.error });
    }

    // Earn performance fee (10%) is on yield, not AUM. Until harvest events are tracked,
    // recognized Earn platform revenue for the period is $0 (rate + AUM still exposed).
    const earnRevenueUsd = 0;
    const earnLine: PlatformRevenueSummary['byProduct']['earn'] = {
      ...emptyProductLine('earn', 'Kura Earn', EARN_PERFORMANCE_FEE_BPS, 'active'),
      processUsd: roundUsd(earnAssets.totalAssetsUsd),
      revenueUsd: earnRevenueUsd,
      aumUsd: roundUsd(earnAssets.totalAssetsUsd),
      performanceFeeBps: EARN_PERFORMANCE_FEE_BPS,
      count: earnAssets.vaultCount,
    };

    const platformRevenueTotal = roundUsd(
      bridge.revenueUsd
        + swap.revenueUsd
        + dinari.revenueUsd
        + earnLine.revenueUsd
        + card.revenueUsd
        + subscriptions.revenueUsd,
    );

    const platformRevenue: PlatformRevenueSummary = {
      totalUsd: platformRevenueTotal,
      policy: {
        bridgeRateBps: BRIDGE_PLATFORM_FEE_BPS,
        swapRateBps: SWAP_PLATFORM_FEE_BPS,
        dinariRateBps: DINARI_PLATFORM_FEE_BPS,
        earnPerformanceFeeBps: EARN_PERFORMANCE_FEE_BPS,
        cardRateBps: CARD_PLATFORM_FEE_BPS,
      },
      byProduct: {
        bridge,
        swap,
        dinari,
        earn: earnLine,
        card,
        subscriptions,
      },
    };

    const privyMetadata =
      latestPrivyMetrics?.metadata && typeof latestPrivyMetrics.metadata === 'object'
        ? (latestPrivyMetrics.metadata as Record<string, unknown>)
        : null;

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      process: {
        totalProcessUsd: roundUsd(totalProcessUsd),
        // Legacy mirrors — frontend should prefer platformRevenue.totalUsd
        totalPlatformFeeUsd: platformRevenueTotal,
        totalNetUsd: platformRevenueTotal,
        eventCount: revenueEvents.length,
        bySource,
      },
      platformRevenue,
      waitlist: {
        totalSignups: waitlistRows.length,
        byProduct,
      },
      subscriptions: {
        activeCount: activeSubscriptions.length,
        byTier,
      },
      activeUsers: {
        totalUsers: typeof privyMetadata?.totalUsers === 'number' ? privyMetadata.totalUsers : 0,
        activeUsers: typeof privyMetadata?.activeUsers === 'number' ? privyMetadata.activeUsers : 0,
        periodFrom:
          typeof privyMetadata?.periodFrom === 'string'
            ? privyMetadata.periodFrom
            : period.from.toISOString(),
        periodTo:
          typeof privyMetadata?.periodTo === 'string'
            ? privyMetadata.periodTo
            : period.to.toISOString(),
        lastSyncedAt: latestPrivyMetrics?.occurredAt.toISOString() ?? null,
      },
      earn: {
        chainId: earnAssets.chainId,
        totalAssetsUsd: earnAssets.totalAssetsUsd,
        vaultCount: earnAssets.vaultCount,
        vaults: earnAssets.vaults,
        performanceFeeBps: EARN_PERFORMANCE_FEE_BPS,
        revenueUsd: earnRevenueUsd,
        fetchedAt: earnAssets.fetchedAt,
        ...(earnAssets.error ? { error: earnAssets.error } : {}),
      },
    };
  }

}

/** @deprecated use PlatformRecordService */
export const PlatformRevenueService = PlatformRecordService;
