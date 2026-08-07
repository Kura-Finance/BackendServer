/**
 * Detect Bridge customers with no local activity for N months (default 6)
 * so ops can deactivate/delete and avoid ongoing VA fees.
 *
 * "Activity" = latest of:
 *   - BridgeVirtualAccountEvent.occurredAt / createdAt
 *   - BridgeTransfer.updatedAt / createdAt
 *   - BridgeCustomer.updatedAt (KYC / endorsement refresh)
 *   - BridgeVirtualAccount.createdAt / LiquidationAddress.createdAt (provisioning)
 * If none exist beyond customer.createdAt, that timestamp is used.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logError } from '../../logger';
import { EmailService } from '../../email/emailService';
import { bridgeFetch, BridgeError } from '../lib/bridgeHttp';
import type { BridgeVirtualAccountResponse } from '../models/types';

const DEFAULT_INACTIVE_MONTHS = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface InactiveBridgeCustomerItem {
  userId: string;
  userEmail: string | null;
  bridgeCustomerId: string;
  kycStatus: string;
  customerCreatedAt: string;
  lastActivityAt: string;
  inactiveDays: number;
  activatedVaCount: number;
  totalVaCount: number;
  liquidationAddressCount: number;
  activitySource: string;
}

export interface InactiveBridgeCustomersResult {
  months: number;
  cutoffAt: string;
  onlyWithActivatedVa: boolean;
  count: number;
  items: InactiveBridgeCustomerItem[];
}

export interface DeleteInactiveBridgeCustomerResult {
  userId: string;
  bridgeCustomerId: string;
  deactivatedVaIds: string[];
  bridgeCustomerDeleted: boolean;
  localCustomerRemoved: boolean;
}

function monthsToCutoff(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export class BridgeInactiveAccountService {
  /**
   * List Bridge customers whose last known activity is older than `months`.
   * Defaults to customers that still have at least one activated VA (cost drivers).
   */
  static async listInactiveCustomers(params?: {
    months?: number;
    onlyWithActivatedVa?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<InactiveBridgeCustomersResult> {
    const months =
      params?.months != null && Number.isFinite(params.months) && params.months > 0
        ? Math.floor(params.months)
        : DEFAULT_INACTIVE_MONTHS;
    const onlyWithActivatedVa = params?.onlyWithActivatedVa !== false;
    const limit = params?.limit ?? 200;
    const offset = params?.offset ?? 0;
    const cutoff = monthsToCutoff(months);

    const customers = await prisma.bridgeCustomer.findMany({
      where: { bridgeCustomerId: { not: null } },
      select: {
        userId: true,
        bridgeCustomerId: true,
        kycStatus: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true } },
        virtualAccounts: {
          select: {
            bridgeVirtualAccountId: true,
            status: true,
            createdAt: true,
          },
        },
        liquidationAddresses: {
          select: { createdAt: true },
        },
      },
    });

    const userIds = customers.map((c) => c.userId);
    const eventMap = new Map<string, Date>();
    const transferMap = new Map<string, Date>();

    if (userIds.length > 0) {
      const [lastEvents, lastTransfers] = await Promise.all([
        prisma.$queryRaw<Array<{ userId: string; at: Date }>>`
          SELECT "userId", MAX(COALESCE("occurredAt", "createdAt")) AS at
          FROM "BridgeVirtualAccountEvent"
          WHERE "userId" IN (${Prisma.join(userIds)})
          GROUP BY "userId"
        `,
        prisma.$queryRaw<Array<{ userId: string; at: Date }>>`
          SELECT "userId", MAX(GREATEST("updatedAt", "createdAt")) AS at
          FROM "BridgeTransfer"
          WHERE "userId" IN (${Prisma.join(userIds)})
          GROUP BY "userId"
        `,
      ]);
      for (const row of lastEvents) {
        if (row.at) eventMap.set(row.userId, new Date(row.at));
      }
      for (const row of lastTransfers) {
        if (row.at) transferMap.set(row.userId, new Date(row.at));
      }
    }

    const items: InactiveBridgeCustomerItem[] = [];

    for (const c of customers) {
      if (!c.bridgeCustomerId) continue;

      const activatedVaCount = c.virtualAccounts.filter((v) => v.status === 'activated').length;
      if (onlyWithActivatedVa && activatedVaCount === 0) continue;

      const lastVaCreated = c.virtualAccounts.reduce<Date | null>((acc, v) => {
        return !acc || v.createdAt > acc ? v.createdAt : acc;
      }, null);
      const lastLaCreated = c.liquidationAddresses.reduce<Date | null>((acc, v) => {
        return !acc || v.createdAt > acc ? v.createdAt : acc;
      }, null);

      const lastEvent = eventMap.get(c.userId) ?? null;
      const lastTransfer = transferMap.get(c.userId) ?? null;

      const candidates: Array<{ at: Date; source: string }> = [];
      if (lastEvent) candidates.push({ at: lastEvent, source: 'va_event' });
      if (lastTransfer) candidates.push({ at: lastTransfer, source: 'transfer' });
      if (lastVaCreated) candidates.push({ at: lastVaCreated, source: 'va_created' });
      if (lastLaCreated) candidates.push({ at: lastLaCreated, source: 'liquidation_created' });
      candidates.push({ at: c.updatedAt, source: 'customer_updated' });
      candidates.push({ at: c.createdAt, source: 'customer_created' });

      candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
      const latest = candidates[0]!;

      if (latest.at.getTime() >= cutoff.getTime()) continue;

      const inactiveDays = Math.floor((Date.now() - latest.at.getTime()) / MS_PER_DAY);
      items.push({
        userId: c.userId,
        userEmail: c.user.email ?? null,
        bridgeCustomerId: c.bridgeCustomerId,
        kycStatus: c.kycStatus,
        customerCreatedAt: c.createdAt.toISOString(),
        lastActivityAt: latest.at.toISOString(),
        inactiveDays,
        activatedVaCount,
        totalVaCount: c.virtualAccounts.length,
        liquidationAddressCount: c.liquidationAddresses.length,
        activitySource: latest.source,
      });
    }

    items.sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt));
    const page = items.slice(offset, offset + limit);

    return {
      months,
      cutoffAt: cutoff.toISOString(),
      onlyWithActivatedVa,
      count: items.length,
      items: page,
    };
  }

  /** Scan inactive customers and email ADMIN_EMAIL a digest. */
  static async notifyInactiveCustomers(params?: {
    months?: number;
    onlyWithActivatedVa?: boolean;
  }): Promise<InactiveBridgeCustomersResult & { emailSent: boolean }> {
    const result = await this.listInactiveCustomers({
      ...params,
      limit: 500,
      offset: 0,
    });

    if (result.count === 0) {
      appLogger.info('[BridgeInactiveAccount] No inactive Bridge customers to notify', {
        months: result.months,
      });
      return { ...result, emailSent: false };
    }

    const preview = result.items.slice(0, 25).map((i) => ({
      userId: i.userId,
      email: i.userEmail ?? '—',
      bridgeCustomerId: i.bridgeCustomerId,
      inactiveDays: i.inactiveDays,
      activatedVas: i.activatedVaCount,
      lastActivityAt: i.lastActivityAt,
      activitySource: i.activitySource,
    }));

    const emailSent = await EmailService.sendAdminOperationEmail(
      'Bridge inactive customers (cost review)',
      {
        months: result.months,
        cutoffAt: result.cutoffAt,
        onlyWithActivatedVa: result.onlyWithActivatedVa,
        totalInactive: result.count,
        activatedVaTotal: result.items.reduce((s, i) => s + i.activatedVaCount, 0),
        preview: JSON.stringify(preview, null, 2),
        actionHint:
          'Review GET /api/admin/bridge/inactive-customers then POST /api/admin/bridge/customers/:userId/delete to remove on Bridge.',
      },
    );

    return { ...result, emailSent };
  }

  /**
   * Deactivate all activated VAs on Bridge, DELETE the Bridge customer,
   * mark local VAs deactivated, remove local BridgeCustomer row.
   */
  static async deleteCustomerForCostSavings(userId: string): Promise<DeleteInactiveBridgeCustomerResult> {
    const customer = await prisma.bridgeCustomer.findUnique({
      where: { userId },
      select: {
        bridgeCustomerId: true,
        virtualAccounts: {
          select: { id: true, bridgeVirtualAccountId: true, status: true },
        },
      },
    });

    if (!customer?.bridgeCustomerId) {
      throw Object.assign(new Error('Bridge customer not found for user'), {
        status: 404,
        code: 'NOT_FOUND',
      });
    }

    const bridgeCustomerId = customer.bridgeCustomerId;
    const deactivatedVaIds: string[] = [];

    for (const va of customer.virtualAccounts) {
      if (va.status !== 'activated') continue;
      try {
        await bridgeFetch<BridgeVirtualAccountResponse>(
          `/customers/${bridgeCustomerId}/virtual_accounts/${va.bridgeVirtualAccountId}/deactivate`,
          {
            method: 'POST',
            idempotencyKey: `va-deactivate:${va.bridgeVirtualAccountId}`,
          },
        );
        await prisma.bridgeVirtualAccount.update({
          where: { id: va.id },
          data: { status: 'deactivated' },
        });
        deactivatedVaIds.push(va.bridgeVirtualAccountId);
      } catch (error) {
        if (error instanceof BridgeError && error.statusCode === 404) {
          await prisma.bridgeVirtualAccount.update({
            where: { id: va.id },
            data: { status: 'deactivated' },
          });
          deactivatedVaIds.push(va.bridgeVirtualAccountId);
          continue;
        }
        logError('[BridgeInactiveAccount] Failed to deactivate VA', error as Error, {
          userId,
          bridgeVirtualAccountId: va.bridgeVirtualAccountId,
        });
        throw error;
      }
    }

    let bridgeCustomerDeleted = false;
    try {
      await bridgeFetch(`/customers/${bridgeCustomerId}`, { method: 'DELETE' });
      bridgeCustomerDeleted = true;
    } catch (error) {
      if (error instanceof BridgeError && error.statusCode === 404) {
        bridgeCustomerDeleted = true;
      } else {
        logError('[BridgeInactiveAccount] Failed to delete Bridge customer', error as Error, {
          userId,
          bridgeCustomerId,
        });
        throw error;
      }
    }

    // Clear FK references then remove local customer row (keeps VA/event history for audit).
    await prisma.$transaction([
      prisma.bridgeVirtualAccount.updateMany({
        where: { userId, bridgeCustomerId },
        data: { bridgeCustomerId: null, status: 'deactivated' },
      }),
      prisma.bridgeTransfer.updateMany({
        where: { userId, bridgeCustomerId },
        data: { bridgeCustomerId: null },
      }),
      prisma.bridgeExternalAccount.updateMany({
        where: { userId, bridgeCustomerId },
        data: { bridgeCustomerId: null },
      }),
      prisma.bridgeLiquidationAddress.updateMany({
        where: { userId, bridgeCustomerId },
        data: { bridgeCustomerId: null },
      }),
      prisma.bridgeCustomer.delete({ where: { userId } }),
    ]);

    appLogger.info('[BridgeInactiveAccount] Deleted Bridge customer for cost savings', {
      userId,
      bridgeCustomerId,
      deactivatedVaIds,
    });

    return {
      userId,
      bridgeCustomerId,
      deactivatedVaIds,
      bridgeCustomerDeleted,
      localCustomerRemoved: true,
    };
  }
}
