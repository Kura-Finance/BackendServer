/**
 * HTTP handlers for LI.FI transfer sync and Investor summary.
 */

import { Request, Response } from 'express';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { LifiAnalyticsService } from '../services/lifiAnalyticsService';

/** POST /sync — lazy sync of DONE transfers into PlatformRecord. */
export const syncTransfers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { force, from, to } = req.query as { force?: boolean; from?: string; to?: string };
    const result = await LifiAnalyticsService.syncTransfersIfStale({
      ...(force ? { force: true } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    sendSuccess(res, result, result.skipped ? 200 : 202);
  } catch (error) {
    logError('LI.FI transfers sync failed', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to sync LI.FI transfers';
    const status = message.includes('LIFI_INTEGRATOR') ? 503 : 500;
    sendError(res, status, {
      code: status === 503 ? 'LIFI_NOT_CONFIGURED' : 'INTERNAL_ERROR',
      message,
    });
  }
};

/** GET /summary — LI.FI process + platform fee totals for a period. */
export const getTransfersSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await LifiAnalyticsService.getTransfersSummary(from, to);
    sendSuccess(res, summary);
  } catch (error) {
    logError('Get LI.FI transfers summary failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch LI.FI transfers summary' });
  }
};
