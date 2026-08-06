/**
 * Bridge funds requests and fiat deposit return flows (admin/ops).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import {
  buildLazySkip,
  getBridgeFundsRequestsSyncMinIntervalMs,
  isWithinInterval,
  type LazyUpdateSkipped,
} from '../../shared/lib/lazyUpdate';
import { appLogger } from '../../logger';
import type {
  BridgeFundsRequestListResponse,
  BridgeFundsRequestStatus,
  BridgeTransferResponse,
  FiatDepositReturnResult,
  FraudRemediateResult,
  FundsRequestListItem,
  FundsRequestsSyncExecuted,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import { asJson } from '../lib/bridgeJson';
import { BridgeFraudRemediationService } from './bridgeFraudRemediationService';

export class BridgeFundsRequestService {
  private static getBridgeWalletId(): string {
    const id = process.env.BRIDGE_WALLET_ID?.trim();
    if (!id) {
      throw new BridgeError(400, 'BRIDGE_WALLET_ID is not configured', 'config');
    }
    return id;
  }

  private static getBridgeWalletCurrency(): string {
    return (process.env.BRIDGE_WALLET_CURRENCY?.trim() || 'usdb').toLowerCase();
  }

  private static parseNoticeDate(value: string | undefined): Date | null {
    if (!value) return null;
    // Bridge notice_date is YYYY-MM-DD; accept ISO timestamps too.
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private static async resolveDepositLocalLink(depositId: string): Promise<{
    userId: string | null;
    bridgeCustomerId: string | null;
  }> {
    const event = await prisma.bridgeVirtualAccountEvent.findFirst({
      where: { depositId },
      select: {
        userId: true,
        virtualAccount: { select: { bridgeCustomerId: true } },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!event) return { userId: null, bridgeCustomerId: null };
    return {
      userId: event.userId,
      bridgeCustomerId: event.virtualAccount?.bridgeCustomerId ?? null,
    };
  }

  static async listFundsRequestsFromBridge(params?: {
    startingAfter?: string;
    limit?: number;
    fraud?: boolean;
    customerId?: string;
  }): Promise<BridgeFundsRequestListResponse> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.startingAfter) query.set('starting_after', params.startingAfter);
    if (params?.fraud != null) query.set('fraud', String(params.fraud));
    if (params?.customerId) query.set('customer_id', params.customerId);
    const qs = query.toString();
    return bridgeFetch<BridgeFundsRequestListResponse>(
      `/funds_requests${qs ? `?${qs}` : ''}`,
    );
  }

  static async syncFundsRequests(): Promise<FundsRequestsSyncExecuted> {
    const now = new Date();
    let startingAfter: string | undefined;
    let totalFromBridge = 0;
    let upserted = 0;
    let fraudAlertsHandled = 0;
    const pageLimit = 100;

    for (;;) {
      const page = await this.listFundsRequestsFromBridge({
        limit: pageLimit,
        ...(startingAfter ? { startingAfter } : {}),
      });
      const rows = page.data ?? [];
      totalFromBridge += rows.length;

      for (const item of rows) {
        if (!item.id || !item.deposit_id) {
          appLogger.warn('[BridgeService] Skipping funds request missing id/deposit_id', {
            id: item.id,
          });
          continue;
        }

        const local = await this.resolveDepositLocalLink(item.deposit_id);
        const bridgeCustomerId = item.customer_id ?? local.bridgeCustomerId;
        const noticeCreatedAt = this.parseNoticeDate(item.notice_date);
        const depositCreatedAt = this.parseNoticeDate(
          item.deposit_created_at ?? item.created_at,
        );
        const isFraud = Boolean(item.fraud);

        const existing = await prisma.bridgeFundsRequest.findUnique({
          where: { bridgeFundsRequestId: item.id },
          select: { id: true, fraud: true },
        });
        const newlyFraud = isFraud && (!existing || !existing.fraud);

        const row = await prisma.bridgeFundsRequest.upsert({
          where: { bridgeFundsRequestId: item.id },
          create: {
            bridgeFundsRequestId: item.id,
            depositId: item.deposit_id,
            bridgeCustomerId,
            userId: local.userId,
            fraud: isFraud,
            amount: item.amount ?? null,
            currency: item.currency?.toLowerCase() ?? null,
            noticeCreatedAt,
            depositCreatedAt,
            raw: asJson(item),
            status: 'open',
            lastSyncedAt: now,
          },
          update: {
            depositId: item.deposit_id,
            bridgeCustomerId,
            userId: local.userId,
            fraud: isFraud,
            amount: item.amount ?? null,
            currency: item.currency?.toLowerCase() ?? null,
            noticeCreatedAt,
            depositCreatedAt,
            raw: asJson(item),
            lastSyncedAt: now,
            // Do not overwrite status — return workflow owns it after first sync.
          },
        });
        upserted += 1;

        if (newlyFraud) {
          try {
            await BridgeFraudRemediationService.handleFraudAlert({
              bridgeCustomerId: row.bridgeCustomerId,
              userId: row.userId,
              fundsRequestId: row.id,
              bridgeFundsRequestId: row.bridgeFundsRequestId,
              depositId: row.depositId,
              amount: row.amount,
              currency: row.currency,
              source: 'sync',
            });
            fraudAlertsHandled += 1;
          } catch (error) {
            appLogger.warn('[BridgeService] Fraud alert remediation failed during sync', {
              fundsRequestId: row.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      if (rows.length < pageLimit) break;
      const lastId = rows[rows.length - 1]?.id;
      if (!lastId || lastId === startingAfter) break;
      startingAfter = lastId;
    }

    appLogger.info('[BridgeService] Funds requests synced', {
      upserted,
      totalFromBridge,
      fraudAlertsHandled,
    });
    return {
      skipped: false,
      upserted,
      totalFromBridge,
      fraudAlertsHandled,
      lastSyncedAt: now.toISOString(),
    };
  }

  static async syncFundsRequestsIfStale(options?: {
    force?: boolean;
  }): Promise<FundsRequestsSyncExecuted | LazyUpdateSkipped> {
    const minIntervalMs = getBridgeFundsRequestsSyncMinIntervalMs();
    if (!options?.force) {
      const latest = await prisma.bridgeFundsRequest.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      });
      if (latest && isWithinInterval(latest.lastSyncedAt, minIntervalMs)) {
        return buildLazySkip({
          reason: 'fresh',
          lastUpdatedAt: latest.lastSyncedAt,
          minIntervalMs,
        });
      }
    }
    return this.syncFundsRequests();
  }

  static async listLocalFundsRequests(params?: {
    fraud?: boolean;
    status?: BridgeFundsRequestStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: FundsRequestListItem[]; total: number }> {
    const where: Prisma.BridgeFundsRequestWhereInput = {
      ...(params?.fraud != null ? { fraud: params.fraud } : {}),
      ...(params?.status ? { status: params.status } : {}),
    };
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const [rows, total] = await Promise.all([
      prisma.bridgeFundsRequest.findMany({
        where,
        orderBy: [{ noticeCreatedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.bridgeFundsRequest.count({ where }),
    ]);

    const depositIds = [...new Set(rows.map((r) => r.depositId))];
    const processed = depositIds.length
      ? await prisma.bridgeVirtualAccountEvent.findMany({
          where: { depositId: { in: depositIds }, type: 'payment_processed' },
          select: { depositId: true },
          distinct: ['depositId'],
        })
      : [];
    const processedSet = new Set(
      processed.map((e) => e.depositId).filter((id): id is string => Boolean(id)),
    );

    const items: FundsRequestListItem[] = rows.map((row) => {
      const raw = (row.raw && typeof row.raw === 'object' ? row.raw : {}) as Record<
        string,
        unknown
      >;
      const paymentRail =
        typeof raw.payment_rail === 'string' ? raw.payment_rail : null;
      return {
        id: row.id,
        bridgeFundsRequestId: row.bridgeFundsRequestId,
        depositId: row.depositId,
        bridgeCustomerId: row.bridgeCustomerId,
        userId: row.userId,
        fraud: row.fraud,
        amount: row.amount,
        currency: row.currency,
        paymentRail,
        noticeCreatedAt: row.noticeCreatedAt?.toISOString() ?? null,
        depositCreatedAt: row.depositCreatedAt?.toISOString() ?? null,
        status: row.status as BridgeFundsRequestStatus,
        returnTransferId: row.returnTransferId,
        returnError: row.returnError,
        paymentProcessed: processedSet.has(row.depositId),
        lastSyncedAt: row.lastSyncedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    return { items, total };
  }

  static async initiateFiatDepositReturn(
    fundsRequestId: string,
  ): Promise<FiatDepositReturnResult> {
    const row = await prisma.bridgeFundsRequest.findUnique({
      where: { id: fundsRequestId },
    });
    if (!row) {
      throw new BridgeError(404, 'Funds request not found', 'funds_requests');
    }
    if (row.status === 'returned') {
      throw new BridgeError(409, 'Funds request already returned', 'funds_requests');
    }
    if (row.status === 'return_initiated' && row.returnTransferId) {
      throw new BridgeError(
        409,
        `Return already initiated (transfer ${row.returnTransferId})`,
        'funds_requests',
      );
    }
    if (row.status !== 'open' && row.status !== 'failed') {
      throw new BridgeError(
        409,
        `Cannot initiate return from status "${row.status}"`,
        'funds_requests',
      );
    }
    if (!row.amount) {
      throw new BridgeError(400, 'Funds request missing amount', 'funds_requests');
    }

    let bridgeCustomerId = row.bridgeCustomerId;
    if (!bridgeCustomerId) {
      const linked = await this.resolveDepositLocalLink(row.depositId);
      bridgeCustomerId = linked.bridgeCustomerId;
    }
    if (!bridgeCustomerId) {
      throw new BridgeError(
        400,
        'Cannot resolve Bridge customer_id for this deposit',
        'funds_requests',
      );
    }

    const destinationCurrency = (row.currency || 'usd').toLowerCase();
    const walletId = this.getBridgeWalletId();
    const walletCurrency = this.getBridgeWalletCurrency();

    try {
      const transfer = await bridgeFetch<BridgeTransferResponse>('/transfers', {
        method: 'POST',
        idempotencyKey: `return:${row.depositId}`,
        body: {
          amount: row.amount,
          on_behalf_of: bridgeCustomerId,
          source: {
            payment_rail: 'bridge_wallet',
            currency: walletCurrency,
            bridge_wallet_id: walletId,
          },
          destination: {
            payment_rail: 'fiat_deposit_return',
            currency: destinationCurrency,
            deposit_id: row.depositId,
          },
        },
      });

      const updated = await prisma.bridgeFundsRequest.update({
        where: { id: row.id },
        data: {
          status: 'return_initiated',
          returnTransferId: transfer.id,
          returnError: null,
          bridgeCustomerId,
        },
      });

      appLogger.info('[BridgeService] Fiat deposit return initiated', {
        fundsRequestId: row.id,
        depositId: row.depositId,
        transferId: transfer.id,
      });

      return {
        id: updated.id,
        bridgeFundsRequestId: updated.bridgeFundsRequestId,
        depositId: updated.depositId,
        status: updated.status as BridgeFundsRequestStatus,
        returnTransferId: transfer.id,
        transferState: transfer.state ?? null,
      };
    } catch (error) {
      const message =
        error instanceof BridgeError
          ? error.bridgeBody
          : error instanceof Error
            ? error.message
            : String(error);
      await prisma.bridgeFundsRequest.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          returnError: message.slice(0, 2000),
        },
      });
      throw error;
    }
  }

  /**
   * One-click Fraud Alert remediation: pause customer + initiate fiat deposit return.
   * Pause always runs first; return failures are surfaced without rolling back pause.
   */
  static async remediateFraudFundsRequest(
    fundsRequestId: string,
  ): Promise<FraudRemediateResult> {
    const pause = await BridgeFraudRemediationService.pauseForFundsRequest(fundsRequestId);
    try {
      const returnResult = await this.initiateFiatDepositReturn(fundsRequestId);
      return { pause, returnResult, returnError: null };
    } catch (error) {
      const message =
        error instanceof BridgeError
          ? error.bridgeBody
          : error instanceof Error
            ? error.message
            : String(error);
      return { pause, returnResult: null, returnError: message };
    }
  }

  static async markFundsRequestReturnedByDeposit(depositId: string): Promise<void> {
    const result = await prisma.bridgeFundsRequest.updateMany({
      where: {
        depositId,
        status: { in: ['open', 'return_initiated', 'failed'] },
      },
      data: {
        status: 'returned',
        returnError: null,
      },
    });
    if (result.count > 0) {
      appLogger.info('[BridgeService] Marked funds request(s) returned via VA refund', {
        depositId,
        count: result.count,
      });
    }
  }
}
