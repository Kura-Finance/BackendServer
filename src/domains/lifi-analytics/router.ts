import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
} from '../platform-insights/schemas/platformInsightsSchemas';
import { getTransfersSummary, syncTransfers } from './controllers/lifiAnalyticsController';

/**
 * LI.FI process volume (Investor).
 * Base path: /api/lifi-analytics
 * GET /summary is public; POST /sync lazy-updates from DB timestamps (?force=true to bypass).
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
