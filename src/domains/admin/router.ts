/**
 * Admin APIs — requireAuth + requireAdmin (ADMIN_EMAILS / ADMIN_EMAIL).
 * Base path: /api/admin
 */

import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import { requireAdmin } from './middleware/requireAdmin';
import {
  clearUserFraudSuspend,
  getFraudRate,
  initiateFundsRequestReturn,
  listFundsRequests,
  pauseFundsRequestCustomer,
  remediateFundsRequest,
  syncFundsRequests,
  unpauseBridgeCustomer,
} from './controllers/bridgeAdminController';
import {
  getFeeWarps,
  getLifiSummary,
  getOverview,
  getUser,
  listUsers,
} from './controllers/dashboardAdminController';
import {
  bridgeCustomerIdParamSchema,
  fraudRateQuerySchema,
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
router.post(
  '/users/:id/clear-fraud-suspend',
  validateRequest({ params: userIdParamSchema }),
  clearUserFraudSuspend,
);
router.get('/overview', getOverview);
router.get('/earn/fee-warps', getFeeWarps);
router.get('/lifi/summary', getLifiSummary);

// ── Bridge funds-request / Fraud Alert ops ───────────────────
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

router.post(
  '/bridge/funds-requests/:id/pause',
  validateRequest({ params: fundsRequestIdParamSchema }),
  pauseFundsRequestCustomer,
);

router.post(
  '/bridge/funds-requests/:id/remediate',
  validateRequest({ params: fundsRequestIdParamSchema }),
  remediateFundsRequest,
);

router.get(
  '/bridge/fraud-rate',
  validateRequest({ query: fraudRateQuerySchema }),
  getFraudRate,
);

router.post(
  '/bridge/customers/:bridgeCustomerId/unpause',
  validateRequest({ params: bridgeCustomerIdParamSchema }),
  unpauseBridgeCustomer,
);

export const adminRouter = router;
