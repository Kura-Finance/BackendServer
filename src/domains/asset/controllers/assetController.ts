import { Request, Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { AssetService } from '../services/assetService';
import { AssetSnapshotData } from '../models/types';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

/**
 * Asset Controller - Request/Response Handling
 */

/**
 * 記錄資產快照
 */
export const recordAssetSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { assetId, name, type, value, currency } = req.body;

    const snapshot: AssetSnapshotData = {
      assetId,
      name,
      type,
      value: parseFloat(value),
      currency: currency || 'USD',
      recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
    };

    const result = await AssetService.recordAssetSnapshot(req.userId, snapshot);
    sendSuccess(res, result);
  } catch (error) {
    logError('Record asset snapshot failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * 批量記錄資產快照
 */
export const recordMultipleSnapshots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { snapshots } = req.body;

    const snapshotData: AssetSnapshotData[] = snapshots.map((s: any) => ({
      assetId: s.assetId,
      name: s.name,
      type: s.type,
      value: parseFloat(s.value),
      currency: s.currency || 'USD',
      recordedAt: s.recordedAt ? new Date(s.recordedAt) : new Date(),
    }));

    const results = await AssetService.recordMultipleSnapshots(req.userId, snapshotData);
    sendSuccess(res, results);
  } catch (error) {
    logError('Record multiple snapshots failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * 獲取最新資產狀態
 */
export const getLatestSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const snapshots = await AssetService.getLatestSnapshot(req.userId);

    if (!snapshots) {
      sendSuccess(res, {
        message: 'No asset records found',
        data: [],
      });
      return;
    }

    sendSuccess(res, {
      message: 'Latest asset snapshot fetched successfully',
      data: snapshots,
    });
  } catch (error) {
    logError('Get latest snapshot failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * 獲取資產歷史數據（用於繪製圖表）
 */
export const getAssetHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const days = Number(req.query.days) || 30;

    const history = await AssetService.getAssetHistory(req.userId, Math.min(days, 365));
    sendSuccess(res, history);
  } catch (error) {
    logError('Get asset history failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * 刪除特定資產的歷史記錄
 */
export const deleteAssetHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const assetId = req.params.assetId as string;

    const count = await AssetService.deleteAssetHistory(req.userId, assetId);
    sendSuccess(res, {
      message: `Deleted ${count} asset records`,
      deletedCount: count,
    });
  } catch (error) {
    logError('Delete asset history failed', error, { userId: (req as AuthRequest).userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
};

/**
 * 獲取所有記錄日期（用於前端日期選擇器）
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
