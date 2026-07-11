/**
 * Gnosis Pay Safe (Smart Contract Wallet) Controllers
 *
 * POST /api/card/gp/safe/deploy      → initiate GP Safe deployment
 * GET  /api/card/gp/safe/deploy      → poll deployment progress
 * GET  /api/card/gp/safe/status      → verify Safe config post-deployment
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import * as GnosisPayService from '../services/gnosisPayService';
import { appLogger } from '../../logger';

function handleGpError(err: unknown, res: Response): void {
  if (err instanceof GnosisPayService.GnosisPayError) {
    if (err.isUnauthorized) {
      sendError(res, 401, { code: 'GP_SESSION_EXPIRED', message: 'GP session expired. Please re-authenticate.' });
      return;
    }
    sendError(res, 502, { code: 'GP_API_ERROR', message: 'Gnosis Pay API error', details: err.gpBody });
    return;
  }
  appLogger.error('[GP Safe Controller] Unexpected error', { error: err instanceof Error ? err.message : String(err) });
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function deploySafe(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    await GnosisPayService.deploySafe(userId);
    res.status(202).json({ message: 'Safe deployment initiated. Poll /gp/safe/status.' });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getSafeDeployStatus(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const deploy = await GnosisPayService.getSafeDeployStatus(userId);
    sendSuccess(res, deploy);
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getSafeStatus(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const config = await GnosisPayService.getSafeConfig(userId);
    // accountStatus 0 = fully configured, 7 = DelayQueueNotEmpty (still valid per GP account-kit)
    const ready = (config.accountStatus === 0 || config.accountStatus === 7) && !!config.safeAddress;
    sendSuccess(res, {
      safeAddress: config.safeAddress,
      accountStatus: config.accountStatus,
      currency: config.currency,
      ready,
    });
  } catch (err) {
    handleGpError(err, res);
  }
}
