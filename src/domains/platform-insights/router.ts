import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  backfillRevenueEvents,
  getInvestorSummary,
  listRecords,
  listRevenueEvents,
} from './controllers/platformInsightsController';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
  platformRecordsQuerySchema,
  revenueEventsQuerySchema,
} from './schemas/platformInsightsSchemas';

/**
 * 平台投資人報表
 * 基礎路徑：/api/platform-insights
 * GET 公開；POST /backfill 依 DB 時間戳懶更新（?force=true 強制）
 */
const router = Router();

router.get(
  '/records',
  validateRequest({ query: platformRecordsQuerySchema }),
  listRecords,
);

router.get(
  '/summary',
  validateRequest({ query: investorPeriodQuerySchema }),
  getInvestorSummary,
);

router.get(
  '/revenue-events',
  validateRequest({ query: revenueEventsQuerySchema }),
  listRevenueEvents,
);

router.post(
  '/backfill',
  validateRequest({ query: lazyUpdateQuerySchema }),
  backfillRevenueEvents,
);

export const platformInsightsRouter = router;
