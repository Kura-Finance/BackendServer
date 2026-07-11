import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type Stripe from 'stripe';
import type { BridgeDrainResponse } from '../../bridge/models/types';
import { prisma } from '../../shared/lib/prisma';
import { appLogger } from '../../logger';
import type { InvestorSummary, RecordPlatformRecordInput } from '../models/types';
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

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function defaultPeriod(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

function feeFromPercent(amount: number | null, feePercent: string | null | undefined): number | null {
  if (amount == null || !feePercent) return null;
  const pct = Number(feePercent);
  if (!Number.isFinite(pct)) return null;
  return roundUsd((amount * pct) / 100);
}

export class PlatformRecordService {
  /** 冪等寫入 PlatformRecord（統一投資人 DB）。 */
  static async record(input: RecordPlatformRecordInput): Promise<void> {
    try {
      await prisma.platformRecord.create({
        data: {
          category: input.category ?? 'revenue',
          userId: input.userId ?? null,
          source: input.source,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          email: input.email ?? null,
          product: input.product ?? null,
          grossAmount: input.grossAmount ?? null,
          platformFee: input.platformFee ?? null,
          netAmount: input.netAmount ?? null,
          currency: (input.currency ?? 'usd').toLowerCase(),
          externalId: input.externalId ?? null,
          depositId: input.depositId ?? null,
          scaAddress: input.scaAddress?.toLowerCase() ?? null,
          occurredAt: input.occurredAt,
          ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
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

    const gross = roundUsd(amountPaidCents / 100);
    const occurredAt = invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date();

    await this.record({
      category: 'revenue',
      userId,
      source: 'stripe',
      eventType: 'invoice_paid',
      idempotencyKey: `stripe:invoice:${invoiceId}`,
      grossAmount: gross,
      platformFee: gross,
      netAmount: gross,
      currency: invoice.currency || 'usd',
      externalId: invoiceId,
      occurredAt,
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

    const gross = parseDecimal(params.amount);
    const platformFee = parseDecimal(params.developerFeeAmount);
    const net = parseDecimal(params.subtotalAmount) ?? gross;

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
      grossAmount: gross,
      platformFee,
      netAmount: net,
      currency: params.currency ?? 'usd',
      externalId: params.bridgeEventId,
      depositId: params.depositId ?? null,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: params.occurredAt ?? new Date(),
      metadata: { bridgeVirtualAccountId: params.bridgeVirtualAccountId },
    });
  }

  static async recordFromBridgeLiquidationDrain(drain: BridgeDrainResponse): Promise<void> {
    if (!drain.id || drain.state !== 'payment_processed') return;
    const laId = drain.liquidation_address_id;
    if (!laId) return;

    const [cryptoLa, payoutLa] = await Promise.all([
      prisma.bridgeLiquidationAddress.findUnique({
        where: { bridgeLiquidationAddressId: laId },
        select: {
          userId: true,
          sourceChain: true,
          sourceCurrency: true,
          destinationCurrency: true,
          developerFeePercent: true,
        },
      }),
      prisma.bridgePayoutLiquidationAddress.findUnique({
        where: { bridgeLiquidationAddressId: laId },
        select: {
          userId: true,
          destinationRail: true,
          destinationCurrency: true,
          developerFeePercent: true,
        },
      }),
    ]);

    const userId = cryptoLa?.userId ?? payoutLa?.userId;
    if (!userId) return;

    const source = cryptoLa ? 'bridge_liquidation_in' : 'bridge_liquidation_out';
    const gross = parseDecimal(drain.amount);
    const feePercent = cryptoLa?.developerFeePercent ?? payoutLa?.developerFeePercent ?? null;
    const platformFee = feeFromPercent(gross, feePercent);

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
      grossAmount: gross,
      platformFee,
      netAmount: platformFee != null && gross != null ? roundUsd(gross - platformFee) : gross,
      currency: drain.currency ?? cryptoLa?.sourceCurrency ?? payoutLa?.destinationCurrency ?? 'usd',
      externalId: drain.id,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: drain.created_at ? new Date(drain.created_at) : new Date(),
      metadata: {
        liquidationAddressId: laId,
        depositTxHash: drain.deposit_tx_hash ?? null,
        destinationTxHash: drain.destination_tx_hash ?? null,
        destination: drain.destination ?? null,
        cryptoRoute: cryptoLa
          ? {
              sourceChain: cryptoLa.sourceChain,
              sourceCurrency: cryptoLa.sourceCurrency,
              destinationCurrency: cryptoLa.destinationCurrency,
            }
          : null,
        payoutRoute: payoutLa
          ? {
              destinationRail: payoutLa.destinationRail,
              destinationCurrency: payoutLa.destinationCurrency,
            }
          : null,
      },
    });
  }

  static async recordFromBridgeTransfer(bridgeTransferId: string): Promise<void> {
    const transfer = await prisma.bridgeTransfer.findUnique({
      where: { bridgeTransferId },
    });
    if (!transfer || transfer.state !== 'payment_processed') return;

    const gross = parseDecimal(transfer.amount);
    const platformFee = parseDecimal(transfer.developerFee);
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
      grossAmount: gross,
      platformFee,
      netAmount: gross,
      currency: transfer.sourceCurrency ?? transfer.destinationCurrency ?? 'usd',
      externalId: bridgeTransferId,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: transfer.updatedAt,
      metadata: {
        direction: transfer.direction,
        sourceRail: transfer.sourceRail,
        destinationRail: transfer.destinationRail,
      },
    });
  }

  static async recordFromCardTransaction(params: {
    userId: string;
    providerEventId: string;
    amount: number;
    currency: string;
    status: string;
    authorizedAt: Date;
  }): Promise<void> {
    if (params.status !== 'cleared') return;

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { scaAddress: true },
    });

    await this.record({
      category: 'revenue',
      userId: params.userId,
      source: 'card',
      eventType: 'card_cleared',
      idempotencyKey: `card:${params.providerEventId}:cleared`,
      grossAmount: roundUsd(params.amount),
      platformFee: 0,
      netAmount: roundUsd(params.amount),
      currency: params.currency.toLowerCase(),
      externalId: params.providerEventId,
      scaAddress: user?.scaAddress ?? null,
      occurredAt: params.authorizedAt,
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
      grossAmount: params.activeUsers,
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
      latestCard,
      latestStripeEvent,
      latestWaitlist,
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
      prisma.cardTransaction.findFirst({
        where: { status: 'cleared', providerEventId: { not: null } },
        orderBy: { authorizedAt: 'desc' },
        select: { providerEventId: true },
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
    ]);

    const keys: string[] = [];
    if (latestVa) keys.push(`bridge:va:${latestVa.bridgeEventId}`);
    if (latestTransfer) {
      keys.push(`bridge:transfer:${latestTransfer.bridgeTransferId}:payment_processed`);
    }
    if (latestCard?.providerEventId) {
      keys.push(`card:${latestCard.providerEventId}:cleared`);
    }
    if (latestStripeEvent?.payload) {
      const payload = latestStripeEvent.payload as unknown as Stripe.Invoice;
      if (payload.id) keys.push(`stripe:invoice:${payload.id}`);
    }
    if (latestWaitlist) {
      keys.push(`waitlist:${latestWaitlist.product}:${latestWaitlist.email}`);
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

    const cardTxs = await prisma.cardTransaction.findMany({
      where: { status: 'cleared', providerEventId: { not: null } },
    });
    for (const tx of cardTxs) {
      if (!tx.providerEventId) continue;
      await this.recordFromCardTransaction({
        userId: tx.userId,
        providerEventId: tx.providerEventId,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        authorizedAt: tx.authorizedAt,
      });
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
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: {
        source: true,
        grossAmount: true,
        platformFee: true,
        netAmount: true,
      },
    });

    const bySource: InvestorSummary['revenue']['bySource'] = {};
    let totalGrossUsd = 0;
    let totalPlatformFeeUsd = 0;
    let totalNetUsd = 0;

    for (const event of revenueEvents) {
      const gross = event.grossAmount ?? 0;
      const fee = event.platformFee ?? 0;
      const net = event.netAmount ?? gross;
      totalGrossUsd += gross;
      totalPlatformFeeUsd += fee;
      totalNetUsd += net;

      let bucket = bySource[event.source];
      if (!bucket) {
        bucket = { grossUsd: 0, platformFeeUsd: 0, netUsd: 0, count: 0 };
        bySource[event.source] = bucket;
      }
      bucket.grossUsd += gross;
      bucket.platformFeeUsd += fee;
      bucket.netUsd += net;
      bucket.count += 1;
    }

    for (const key of Object.keys(bySource)) {
      const row = bySource[key];
      if (!row) continue;
      row.grossUsd = roundUsd(row.grossUsd);
      row.platformFeeUsd = roundUsd(row.platformFeeUsd);
      row.netUsd = roundUsd(row.netUsd);
    }

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

    const latestPrivyMetrics = await prisma.platformRecord.findFirst({
      where: { category: 'active_users', eventType: 'privy_metrics_snapshot' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true, metadata: true },
    });

    const privyMetadata =
      latestPrivyMetrics?.metadata && typeof latestPrivyMetrics.metadata === 'object'
        ? (latestPrivyMetrics.metadata as Record<string, unknown>)
        : null;

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      revenue: {
        totalGrossUsd: roundUsd(totalGrossUsd),
        totalPlatformFeeUsd: roundUsd(totalPlatformFeeUsd),
        totalNetUsd: roundUsd(totalNetUsd),
        eventCount: revenueEvents.length,
        bySource,
      },
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
    };
  }
}

/** @deprecated use PlatformRecordService */
export const PlatformRevenueService = PlatformRecordService;
