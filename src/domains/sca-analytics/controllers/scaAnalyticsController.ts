import { Response } from 'express';
import { Request } from 'express';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { ScaAnalyticsService } from '../services/scaAnalyticsService';

export const scanAllScaWallets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { force } = req.query as { force?: boolean };
    const result = await ScaAnalyticsService.scanAllScaWalletsIfStale({
      ...(force ? { force: true } : {}),
    });
    sendSuccess(res, result, result.skipped ? 200 : 202);
  } catch (error) {
    logError('SCA scan failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to scan SCA wallets' });
  }
};

export const getScaAumSummary = async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await ScaAnalyticsService.getAumSummary();
    sendSuccess(res, summary);
  } catch (error) {
    logError('Get SCA AUM summary failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch SCA AUM summary' });
  }
};

export const listScaSnapshots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit } = req.query as { limit?: number };
    const snapshots = await ScaAnalyticsService.listSnapshots(limit);
    sendSuccess(res, { snapshots, count: snapshots.length });
  } catch (error) {
    logError('List SCA snapshots failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to list SCA snapshots' });
  }
};
