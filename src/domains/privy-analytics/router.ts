import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
} from '../platform-insights/schemas/platformInsightsSchemas';
import { getActiveUsersSummary, syncActiveUsers } from './controllers/privyAnalyticsController';

/**
 * Privy active-user metrics.
 * Base path: /api/privy-analytics
 * GETs are public; POST /sync lazy-updates from DB timestamps (?force=true to bypass).
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
