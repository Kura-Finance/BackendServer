/**
 * HTTP handlers for Privy active-user sync and summary.
 */

import { Request, Response } from 'express';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { PrivyAnalyticsService } from '../services/privyAnalyticsService';

/** POST /sync — lazy sync of Privy user metrics into PlatformRecord. */
export const syncActiveUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { force, from, to } = req.query as { force?: boolean; from?: string; to?: string };
    const result = await PrivyAnalyticsService.syncActiveUsersIfStale({
      ...(force ? { force: true } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    sendSuccess(res, result, result.skipped ? 200 : 202);
  } catch (error) {
    logError('Privy active users sync failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to sync Privy active users' });
  }
};

/** GET /summary — latest Privy total/active user snapshot. */
export const getActiveUsersSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await PrivyAnalyticsService.getActiveUsersSummary(from, to);
    sendSuccess(res, summary);
  } catch (error) {
    logError('Get Privy active users summary failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch Privy active users' });
  }
};
