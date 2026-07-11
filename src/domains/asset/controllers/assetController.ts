import { Request, Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { AssetService } from '../services/assetService';
import { AssetSnapshotData } from '../models/types';
import { logError } from '../../logger';

/**
 * Asset Controller - Request/Response Handling
 */

/**
 * 記錄資產快照
 */
export const recordAssetSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { assetId, name, type, value, currency } = req.body;

    if (!assetId || !name || !type || value === undefined) {
      res.status(400).json({
        error: '缺少必要欄位: assetId, name, type, value',
      });
      return;
    }

    const snapshot: AssetSnapshotData = {
      assetId,
      name,
      type,
      value: parseFloat(value),
      currency: currency || 'USD',
      recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
    };

    const result = await AssetService.recordAssetSnapshot(req.userId, snapshot);
    res.json(result);
  } catch (error) {
    logError('Record asset snapshot failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

/**
 * 批量記錄資產快照
 */
export const recordMultipleSnapshots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { snapshots } = req.body;

    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      res.status(400).json({ error: 'snapshots 必須是非空陣列' });
      return;
    }

    const snapshotData: AssetSnapshotData[] = snapshots.map((s: any) => ({
      assetId: s.assetId,
      name: s.name,
      type: s.type,
      value: parseFloat(s.value),
      currency: s.currency || 'USD',
      recordedAt: s.recordedAt ? new Date(s.recordedAt) : new Date(),
    }));

    const results = await AssetService.recordMultipleSnapshots(req.userId, snapshotData);
    res.json(results);
  } catch (error) {
    logError('Record multiple snapshots failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

/**
 * 獲取最新資產狀態
 */
export const getLatestSnapshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const snapshots = await AssetService.getLatestSnapshot(req.userId);

    if (!snapshots) {
      res.json({
        message: '尚無資產紀錄',
        data: [],
      });
      return;
    }

    res.json({
      message: '成功取得最新資產狀態',
      data: snapshots,
    });
  } catch (error) {
    logError('Get latest snapshot failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

/**
 * 獲取資產歷史數據（用於繪製圖表）
 */
export const getAssetHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const days = parseInt(req.query.days as string) || 30;

    const history = await AssetService.getAssetHistory(req.userId, Math.min(days, 365));
    res.json(history);
  } catch (error) {
    logError('Get asset history failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

/**
 * 刪除特定資產的歷史記錄
 */
export const deleteAssetHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const assetId = typeof req.params.assetId === 'string' ? req.params.assetId : '';

    if (!assetId) {
      res.status(400).json({ error: 'assetId 不能為空' });
      return;
    }

    const count = await AssetService.deleteAssetHistory(req.userId, assetId);
    res.json({
      message: `已刪除 ${count} 筆資產紀錄`,
      deletedCount: count,
    });
  } catch (error) {
    logError('Delete asset history failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

/**
 * 獲取所有記錄日期（用於前端日期選擇器）
 */
export const getRecordDates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const dates = await AssetService.getRecordDates(req.userId);
    res.json({
      dates,
      count: dates.length,
    });
  } catch (error) {
    logError('Get record dates failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};
