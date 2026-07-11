import { Router } from 'express';
import {
  recordAssetSnapshot,
  recordMultipleSnapshots,
  getLatestSnapshot,
  getAssetHistory,
  deleteAssetHistory,
  getRecordDates,
} from './controllers/assetController';
import { requireAuth } from '../auth/middleware/auth';

const router = Router();

/**
 * Asset Routes (All require authentication)
 */

// 記錄單個資產快照
router.post('/snapshot', requireAuth, recordAssetSnapshot);

// 批量記錄資產快照
router.post('/snapshots', requireAuth, recordMultipleSnapshots);

// 獲取最新資產狀態
router.get('/latest', requireAuth, getLatestSnapshot);

// 獲取資產歷史數據 (用於繪製圖表)
// Query: ?days=30 (預設 30 天, 最多 365 天)
router.get('/history', requireAuth, getAssetHistory);

// 獲取所有記錄日期
router.get('/dates', requireAuth, getRecordDates);

// 刪除特定資產的歷史記錄
router.delete('/:assetId', requireAuth, deleteAssetHistory);

export default router;
