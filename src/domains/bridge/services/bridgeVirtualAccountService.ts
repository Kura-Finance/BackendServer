import { Prisma } from '@prisma/client';
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
  BridgeVirtualAccountEventResponse,
  BridgeVirtualAccountHistoryResponse,
  BridgeVirtualAccountResponse,
  CreateVirtualAccountParams,
  DepositEvent,
  DepositPayerInfo,
  DepositResult,
  VirtualAccountResult,
} from '../models/types';
import {
  EMPTY_DEPOSIT_PAYER,
  parseDepositPayerSource,
  resolveOnRampMinDeposit,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import {
  buildDepositDeveloperFee,
  buildVirtualAccountFeeBody,
  onRampFeePercent,
} from '../lib/bridgeFees';
import { asJson } from '../lib/bridgeJson';
import type { BridgeWebhookSyncContext } from '../lib/bridgeWebhookContext';
import {
  assertEndorsementForCurrency,
  isBridgeNotFound,
  requireTransactableCustomer,
  resolveUserWalletAddress,
  withStaleCustomerGuard,
} from '../lib/bridgeCustomerAccess';
import { BridgeFundsRequestService } from './bridgeFundsRequestService';

const VA_HISTORY_PAGE_LIMIT = 100;

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

export class BridgeVirtualAccountService {
  static async getOrCreateVirtualAccount(
    userId: string,
    params: CreateVirtualAccountParams,
  ): Promise<VirtualAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeVirtualAccount(userId, params.sourceCurrency);
    }

    const bridgeCustomerId = await requireTransactableCustomer(userId);

    // 入金幣別需要對應的 rail endorsement（gbp→faster_payments 等）；
    // 缺少時回清楚的 409，而非 Bridge 的神秘 401 not_allowed。
    await assertEndorsementForCurrency(userId, params.sourceCurrency);

    const address = params.toAddress ?? (await resolveUserWalletAddress(userId));
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

    const va = await withStaleCustomerGuard(userId, 'getOrCreateVirtualAccount', () =>
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
      if (event.deposit_id) {
        await BridgeFundsRequestService.markFundsRequestReturnedByDeposit(event.deposit_id);
      }
    }

    appLogger.info('[BridgeService] VA activity recorded', {
      userId: va.userId,
      vaId,
      type: event.type,
      depositId: event.deposit_id,
    });
  }

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
}
