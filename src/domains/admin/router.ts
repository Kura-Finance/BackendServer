/**
 * Admin APIs — requireAuth + requireAdmin (ADMIN_EMAILS / ADMIN_EMAIL).
 * Base path: /api/admin
 */

import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import { requireAdmin } from './middleware/requireAdmin';
import {
  initiateFundsRequestReturn,
  listFundsRequests,
  syncFundsRequests,
} from './controllers/bridgeAdminController';
import {
  getFeeWarps,
  getLifiSummary,
  getOverview,
  getUser,
  listUsers,
} from './controllers/dashboardAdminController';
import {
  fundsRequestIdParamSchema,
  lazyUpdateQuerySchema,
  listFundsRequestsQuerySchema,
  userIdParamSchema,
} from './schemas/adminSchemas';

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Dashboard (Kura Admin console) ───────────────────────────
router.get('/users', listUsers);
router.get(
  '/users/:id',
  validateRequest({ params: userIdParamSchema }),
  getUser,
);
router.get('/overview', getOverview);
router.get('/earn/fee-warps', getFeeWarps);
router.get('/lifi/summary', getLifiSummary);

// ── Bridge funds-request ops ─────────────────────────────────
router.post(
  '/bridge/funds-requests/sync',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);

router.get(
  '/bridge/funds-requests',
  validateRequest({ query: listFundsRequestsQuerySchema }),
  listFundsRequests,
);

router.post(
  '/bridge/funds-requests/:id/return',
  validateRequest({ params: fundsRequestIdParamSchema }),
  initiateFundsRequestReturn,
);

export const adminRouter = router;
