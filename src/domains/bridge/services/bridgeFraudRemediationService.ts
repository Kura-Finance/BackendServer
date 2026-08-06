/**
 * Bridge Fraud Alert remediation: pause customer on Bridge + platform suspend.
 * Policy: suspend immediately on fraud alert; only clear after sender withdraws claim.
 */

import { prisma } from '../../shared/lib/prisma';
import { appLogger, logError } from '../../logger';
import { EmailService } from '../../email/emailService';
import type { BridgeCustomerResponse } from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import { asJson, normalizeRejectionReasons } from '../lib/bridgeJson';

export type FraudPauseResult = {
  bridgeCustomerId: string | null;
  userId: string | null;
  bridgePaused: boolean;
  platformSuspended: boolean;
  alreadyPaused: boolean;
  alreadySuspended: boolean;
};

export class BridgeFraudRemediationService {
  /** PUT Bridge customer status=paused and sync local kycStatus. */
  static async pauseBridgeCustomer(
    bridgeCustomerId: string,
    reason: string,
  ): Promise<{ alreadyPaused: boolean; kycStatus: string }> {
    const local = await prisma.bridgeCustomer.findFirst({
      where: { bridgeCustomerId },
      select: { id: true, kycStatus: true },
    });

    if (local?.kycStatus === 'paused' || local?.kycStatus === 'offboarded') {
      return { alreadyPaused: true, kycStatus: local.kycStatus };
    }

    const customer = await bridgeFetch<BridgeCustomerResponse>(
      `/customers/${bridgeCustomerId}`,
      {
        method: 'PUT',
        body: { status: 'paused' },
      },
    );

    const kycStatus = customer.kyc_status ?? customer.status ?? 'paused';
    if (local) {
      await prisma.bridgeCustomer.update({
        where: { id: local.id },
        data: {
          kycStatus,
          ...(customer.endorsements ? { endorsements: asJson(customer.endorsements) } : {}),
          ...(customer.rejection_reasons !== undefined
            ? {
                rejectionReasons: asJson(
                  normalizeRejectionReasons(customer.rejection_reasons),
                ),
              }
            : {}),
        },
      });
    }

    appLogger.info('[BridgeFraud] Paused Bridge customer', {
      bridgeCustomerId,
      kycStatus,
      reason,
    });

    return { alreadyPaused: false, kycStatus };
  }

  /** Platform suspend — blocks account deletion until admin clears. */
  static async suspendPlatformUser(params: {
    userId: string;
    reason: string;
    fundsRequestId?: string | null;
  }): Promise<{ alreadySuspended: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { fraudSuspendedAt: true },
    });
    if (!user) {
      throw new BridgeError(404, 'User not found', 'fraud_suspend');
    }
    if (user.fraudSuspendedAt) {
      return { alreadySuspended: true };
    }

    await prisma.user.update({
      where: { id: params.userId },
      data: {
        fraudSuspendedAt: new Date(),
        fraudSuspendReason: params.reason.slice(0, 2000),
        fraudSuspendFundsRequestId: params.fundsRequestId ?? null,
      },
    });

    appLogger.info('[BridgeFraud] Platform user suspended', {
      userId: params.userId,
      fundsRequestId: params.fundsRequestId,
    });

    return { alreadySuspended: false };
  }

  /**
   * Clear platform suspend after sender withdraws fraud claim.
   * Does not unpause Bridge — call unpauseBridgeCustomer separately if needed.
   */
  static async clearPlatformSuspend(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BridgeError(404, 'User not found', 'fraud_suspend');
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        fraudSuspendedAt: null,
        fraudSuspendReason: null,
        fraudSuspendFundsRequestId: null,
      },
    });
    appLogger.info('[BridgeFraud] Cleared platform fraud suspend', { userId });
  }

  /** PUT Bridge customer status=active (only after claim withdrawn). */
  static async unpauseBridgeCustomer(bridgeCustomerId: string): Promise<string> {
    const customer = await bridgeFetch<BridgeCustomerResponse>(
      `/customers/${bridgeCustomerId}`,
      {
        method: 'PUT',
        body: { status: 'active' },
      },
    );
    const kycStatus = customer.kyc_status ?? customer.status ?? 'active';
    await prisma.bridgeCustomer.updateMany({
      where: { bridgeCustomerId },
      data: { kycStatus },
    });
    appLogger.info('[BridgeFraud] Unpaused Bridge customer', { bridgeCustomerId, kycStatus });
    return kycStatus;
  }

  /**
   * Full Fraud Alert response: pause Bridge + suspend platform + email ops.
   * Best-effort: Bridge pause failures are logged but platform suspend still applied when userId known.
   */
  static async handleFraudAlert(params: {
    bridgeCustomerId: string | null;
    userId: string | null;
    fundsRequestId: string;
    bridgeFundsRequestId: string;
    depositId: string;
    amount: string | null;
    currency: string | null;
    source: 'sync' | 'admin';
  }): Promise<FraudPauseResult> {
    const reason = `Bridge Fraud Alert (${params.bridgeFundsRequestId}) deposit ${params.depositId}`;
    let bridgePaused = false;
    let alreadyPaused = false;
    let platformSuspended = false;
    let alreadySuspended = false;

    if (params.bridgeCustomerId) {
      try {
        const pause = await this.pauseBridgeCustomer(params.bridgeCustomerId, reason);
        bridgePaused = !pause.alreadyPaused;
        alreadyPaused = pause.alreadyPaused;
      } catch (error) {
        logError('[BridgeFraud] Failed to pause Bridge customer', error as Error, {
          bridgeCustomerId: params.bridgeCustomerId,
          fundsRequestId: params.fundsRequestId,
        });
      }
    }

    if (params.userId) {
      try {
        const suspend = await this.suspendPlatformUser({
          userId: params.userId,
          reason,
          fundsRequestId: params.fundsRequestId,
        });
        platformSuspended = !suspend.alreadySuspended;
        alreadySuspended = suspend.alreadySuspended;
      } catch (error) {
        logError('[BridgeFraud] Failed to suspend platform user', error as Error, {
          userId: params.userId,
          fundsRequestId: params.fundsRequestId,
        });
      }
    }

    void EmailService.sendAdminOperationEmail('bridge_fraud_alert', {
      source: params.source,
      fundsRequestId: params.fundsRequestId,
      bridgeFundsRequestId: params.bridgeFundsRequestId,
      depositId: params.depositId,
      bridgeCustomerId: params.bridgeCustomerId ?? 'unknown',
      userId: params.userId ?? 'unknown',
      amount: params.amount ?? 'unknown',
      currency: params.currency ?? 'unknown',
      bridgePaused: String(bridgePaused || alreadyPaused),
      platformSuspended: String(platformSuspended || alreadySuspended),
      action:
        'Suspend customer on platform, investigate, share findings with Bridge, issue return if funds available.',
    });

    return {
      bridgeCustomerId: params.bridgeCustomerId,
      userId: params.userId,
      bridgePaused: bridgePaused || alreadyPaused,
      platformSuspended: platformSuspended || alreadySuspended,
      alreadyPaused,
      alreadySuspended,
    };
  }

  /** Resolve local ids from a funds-request row and run Fraud Alert remediation. */
  static async pauseForFundsRequest(fundsRequestId: string): Promise<FraudPauseResult> {
    const row = await prisma.bridgeFundsRequest.findUnique({
      where: { id: fundsRequestId },
    });
    if (!row) {
      throw new BridgeError(404, 'Funds request not found', 'funds_requests');
    }

    let bridgeCustomerId = row.bridgeCustomerId;
    let userId = row.userId;

    if ((!bridgeCustomerId || !userId) && row.depositId) {
      const event = await prisma.bridgeVirtualAccountEvent.findFirst({
        where: { depositId: row.depositId },
        select: {
          userId: true,
          virtualAccount: { select: { bridgeCustomerId: true } },
        },
      });
      userId = userId ?? event?.userId ?? null;
      bridgeCustomerId =
        bridgeCustomerId ?? event?.virtualAccount?.bridgeCustomerId ?? null;
    }

    if (!bridgeCustomerId && !userId) {
      throw new BridgeError(
        400,
        'Cannot resolve Bridge customer or user for this funds request',
        'funds_requests',
      );
    }

    return this.handleFraudAlert({
      bridgeCustomerId,
      userId,
      fundsRequestId: row.id,
      bridgeFundsRequestId: row.bridgeFundsRequestId,
      depositId: row.depositId,
      amount: row.amount,
      currency: row.currency,
      source: 'admin',
    });
  }
}
