/**
 * Asset HTTP handlers (Phase 3 Zero-Access E2EE only).
 *
 * Since PR 5, legacy plaintext history paths are removed. All history uses:
 *   - `/api/assets/history/encrypted` (canonical)
 *   - `/api/assets/history`           (legacy-compatible alias)
 * Client unwraps payloadKeys with privateKey, then decrypts each snapshot row.
 */
import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { AssetService } from '../services/assetService';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

/**
 * GET /api/assets/history/encrypted?days=30 (alias: /api/assets/history).
 * Basic: max 30 days; Pro / Ultimate: max 365.
 *
 * Backend does not decrypt. Returns payloadKeys + encrypted snapshot rows;
 * client builds the plaidInvestment / cryptoSpot time series.
 *
 * Aggregation hints for the client:
 * - metric may be base or sub-scoped (`{base}:{source}:{id}`)
 * - same sub-scoped key, same day → keep latest recordedAt; sum across sub-scopes by base
 */
export const getEncryptedAssetHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const days = Number(req.query.days) || 30;
    const result = await AssetService.getEncryptedAssetHistory(req.userId, days);
    sendSuccess(res, result);
  } catch (error) {
    logError('Get encrypted asset history failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * GET /api/assets/dates — distinct recordedAt values for the date picker.
 * Metadata only; no payload decryption.
 */
export const getRecordDates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const dates = await AssetService.getRecordDates(req.userId);
    sendSuccess(res, {
      dates,
      count: dates.length,
    });
  } catch (error) {
    logError('Get record dates failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};
