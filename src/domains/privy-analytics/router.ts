import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
} from '../platform-insights/schemas/platformInsightsSchemas';
import { getActiveUsersSummary, syncActiveUsers } from './controllers/privyAnalyticsController';

/**
 * Privy 活躍用戶統計
 * 基礎路徑：/api/privy-analytics
 * GET 公開；POST /sync 依 DB 時間戳懶更新（?force=true 強制）
 */
const router = Router();

router.post(
  '/sync',
  validateRequest({ query: lazyUpdateQuerySchema.merge(investorPeriodQuerySchema) }),
  syncActiveUsers,
);
router.get(
  '/summary',
  validateRequest({ query: investorPeriodQuerySchema }),
  getActiveUsersSummary,
);

export const privyAnalyticsRouter = router;
