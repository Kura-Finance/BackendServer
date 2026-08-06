/**
 * Admin controllers for Bridge funds-request, Fraud Alert pause/return, fraud rate.
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { BridgeError, BridgeService } from '../../bridge/services/bridgeService';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import type { BridgeFundsRequestStatus } from '../../bridge/models/types';

function handleBridgeAdminError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof BridgeError) {
    if (error.path === 'config' && error.bridgeBody.includes('BRIDGE_WALLET_ID')) {
      sendError(res, 400, {
        code: 'BRIDGE_WALLET_NOT_CONFIGURED',
        message: 'BRIDGE_WALLET_ID is not configured.',
      });
      return;
    }

    const structured = error.structuredBody;
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    sendError(res, status, {
      code: status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'BRIDGE_API_ERROR',
      message: structured?.message ?? error.bridgeBody ?? fallbackMessage,
      details: { bridgePath: error.path, bridgeBody: error.bridgeBody },
    });
    return;
  }
  const err = error as Error & { status?: number; code?: string };
  if (err.status && err.code) {
    sendError(res, err.status, { code: err.code, message: err.message || fallbackMessage });
    return;
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  sendError(res, 500, { code: 'INTERNAL_ERROR', message });
}

/** Lazy/force sync of Bridge funds requests into local DB (auto-pauses new fraud alerts). */
export const syncFundsRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const force = Boolean((req.query as { force?: boolean }).force);
    const result = await BridgeService.syncFundsRequestsIfStale({ force });
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge funds-requests sync failed', error as Error, { userId: req.userId });
    handleBridgeAdminError(res, error, 'Failed to sync Bridge funds requests');
  }
};

/** List local funds requests (optional fraud filter). */
export const listFundsRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = req.query as {
      fraud?: boolean | string;
      status?: BridgeFundsRequestStatus;
      limit?: number | string;
      offset?: number | string;
    };
    const fraud =
      query.fraud === undefined
        ? undefined
        : query.fraud === true || query.fraud === 'true' || query.fraud === '1';
    const limit =
      query.limit === undefined || query.limit === ''
        ? undefined
        : Number(query.limit);
    const offset =
      query.offset === undefined || query.offset === ''
        ? undefined
        : Number(query.offset);
    const result = await BridgeService.listLocalFundsRequests({
      ...(fraud != null ? { fraud } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(limit != null && Number.isFinite(limit) ? { limit } : {}),
      ...(offset != null && Number.isFinite(offset) ? { offset } : {}),
    });
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge funds-requests list failed', error as Error, { userId: req.userId });
    handleBridgeAdminError(res, error, 'Failed to list Bridge funds requests');
  }
};

/** Initiate a fiat deposit return for a funds request. */
export const initiateFundsRequestReturn = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = (req.params as { id: string }).id;
    const result = await BridgeService.initiateFiatDepositReturn(id);
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge funds-request return failed', error as Error, {
      userId: req.userId,
      fundsRequestId: req.params.id,
    });
    handleBridgeAdminError(res, error, 'Failed to initiate fiat deposit return');
  }
};

/** Pause Bridge customer + platform-suspend for a funds request (Fraud Alert). */
export const pauseFundsRequestCustomer = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = (req.params as { id: string }).id;
    const result = await BridgeService.pauseForFundsRequest(id);
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge funds-request pause failed', error as Error, {
      userId: req.userId,
      fundsRequestId: req.params.id,
    });
    handleBridgeAdminError(res, error, 'Failed to pause customer for funds request');
  }
};

/** One-click: pause + initiate fiat deposit return. */
export const remediateFundsRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = (req.params as { id: string }).id;
    const result = await BridgeService.remediateFraudFundsRequest(id);
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge funds-request remediate failed', error as Error, {
      userId: req.userId,
      fundsRequestId: req.params.id,
    });
    handleBridgeAdminError(res, error, 'Failed to remediate funds request');
  }
};

/** Monthly fraud rate (Penalty Box thresholds). */
export const getFraudRate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const month = (req.query as { month?: string }).month;
    const result = await BridgeService.getFraudRateMonthSummary(month);
    sendSuccess(res, result);
  } catch (error) {
    logError('Admin Bridge fraud rate failed', error as Error, { userId: req.userId });
    handleBridgeAdminError(res, error, 'Failed to compute fraud rate');
  }
};

/**
 * Clear platform fraud suspend after sender withdraws claim.
 * Does not unpause Bridge — use unpause customer endpoint separately.
 */
export const clearUserFraudSuspend = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    await BridgeService.clearPlatformSuspend(id);
    sendSuccess(res, { userId: id, fraudSuspended: false });
  } catch (error) {
    logError('Admin clear fraud suspend failed', error as Error, {
      userId: req.userId,
      targetUserId: req.params.id,
    });
    handleBridgeAdminError(res, error, 'Failed to clear fraud suspend');
  }
};

/** Unpause Bridge customer (only after fraud claim withdrawn). */
export const unpauseBridgeCustomer = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { bridgeCustomerId } = req.params as { bridgeCustomerId: string };
    const kycStatus = await BridgeService.unpauseBridgeCustomer(bridgeCustomerId);
    sendSuccess(res, { bridgeCustomerId, kycStatus });
  } catch (error) {
    logError('Admin Bridge customer unpause failed', error as Error, {
      userId: req.userId,
      bridgeCustomerId: req.params.bridgeCustomerId,
    });
    handleBridgeAdminError(res, error, 'Failed to unpause Bridge customer');
  }
};
