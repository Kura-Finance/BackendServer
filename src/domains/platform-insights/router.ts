import { Router } from 'express';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  backfillProcessEvents,
  getInvestorSummary,
  listRecords,
  listProcessEvents,
} from './controllers/platformInsightsController';
import {
  investorPeriodQuerySchema,
  lazyUpdateQuerySchema,
  platformRecordsQuerySchema,
  processEventsQuerySchema,
} from './schemas/platformInsightsSchemas';

/**
 * Investor platform insights.
 * Base path: /api/platform-insights
 * GETs are public; POST /backfill lazy-updates from DB timestamps (?force=true to bypass).
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
  '/process-events',
  validateRequest({ query: processEventsQuerySchema }),
  listProcessEvents,
);

router.post(
  '/backfill',
  validateRequest({ query: lazyUpdateQuerySchema }),
  backfillProcessEvents,
);

export const platformInsightsRouter = router;
