/**
 * Admin controllers for Bridge funds-request sync and fiat deposit returns.
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
  const message = error instanceof Error ? error.message : fallbackMessage;
  sendError(res, 500, { code: 'INTERNAL_ERROR', message });
}

/** Lazy/force sync of Bridge funds requests into local DB. */
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
      fraud?: boolean;
      status?: BridgeFundsRequestStatus;
      limit?: number;
      offset?: number;
    };
    const result = await BridgeService.listLocalFundsRequests({
      ...(query.fraud != null ? { fraud: query.fraud } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.limit != null ? { limit: query.limit } : {}),
      ...(query.offset != null ? { offset: query.offset } : {}),
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
