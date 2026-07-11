import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import { lazyUpdateQuerySchema, scaSnapshotsQuerySchema } from '../platform-insights/schemas/platformInsightsSchemas';
import {
  getScaAumSummary,
  listScaSnapshots,
  scanAllScaWallets,
} from './controllers/scaAnalyticsController';

/**
 * Kura SCA 錢包 AUM 統計
 * 基礎路徑：/api/sca-analytics
 * GET 公開；POST /scan 依 DB 時間戳懶更新（?force=true 強制）
 */
const router = Router();

router.post('/scan', validateRequest({ query: lazyUpdateQuerySchema }), scanAllScaWallets);
router.get('/summary', getScaAumSummary);
router.get('/snapshots', validateRequest({ query: scaSnapshotsQuerySchema }), listScaSnapshots);

export const scaAnalyticsRouter = router;
