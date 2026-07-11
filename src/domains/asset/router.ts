import { Router } from 'express';
import {
  getEncryptedAssetHistory,
  getRecordDates,
} from './controllers/assetController';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  getAssetHistoryQuerySchema,
} from './schemas/assetSchemas';

const router = Router();

/**
 * 資產路由（全部需要驗證）— Phase 3 Zero-Access E2EE only
 *
 * 自 PR 5 起：所有 asset history 均為加密形式。
 * `/history` 保留作為 `/history/encrypted` 的相容性別名，避免前端 404。
 */

// 取得「加密形式」資產歷史（canonical path + legacy alias）
// 查詢參數：?days=30（預設 30 天，最多 365 天）
router.get(
  ['/history/encrypted', '/history'],
  requireAuth,
  validateRequest({ query: getAssetHistoryQuerySchema }),
  getEncryptedAssetHistory,
);

// 取得所有記錄日期（metadata only）
router.get('/dates', requireAuth, getRecordDates);

export default router;
