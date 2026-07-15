import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
} from '../platform-insights/schemas/platformInsightsSchemas';
import { getTransfersSummary, syncTransfers } from './controllers/lifiAnalyticsController';

/**
 * LI.FI 處理量（Investor）
 * 基礎路徑：/api/lifi-analytics
 * GET /summary 公開；POST /sync 依 DB 時間戳懶更新（?force=true 強制）
 */
const router = Router();

router.post(
  '/sync',
  validateRequest({ query: lazyUpdateQuerySchema.merge(investorPeriodQuerySchema) }),
  syncTransfers,
);
router.get(
  '/summary',
  validateRequest({ query: investorPeriodQuerySchema }),
  getTransfersSummary,
);

export const lifiAnalyticsRouter = router;
