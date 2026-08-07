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
  deleteBridgeCustomerForCostSavings,
  getFraudRate,
  initiateFundsRequestReturn,
  listFundsRequests,
  listInactiveBridgeCustomers,
  notifyInactiveBridgeCustomers,
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
  bridgeCostDeleteUserParamSchema,
  bridgeCustomerIdParamSchema,
  fraudRateQuerySchema,
  fundsRequestIdParamSchema,
  inactiveBridgeCustomersQuerySchema,
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
// Prefer GET/POST /refresh — some CDNs/WAFs challenge POST …/sync.
router.get(
  '/bridge/funds-requests/refresh',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);
router.post(
  '/bridge/funds-requests/refresh',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);
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

/** Alias — avoids WAF rules that match the literal path segment `fraud`. */
router.get(
  '/bridge/penalty-box',
  validateRequest({ query: fraudRateQuerySchema }),
  getFraudRate,
);

router.post(
  '/bridge/customers/:bridgeCustomerId/unpause',
  validateRequest({ params: bridgeCustomerIdParamSchema }),
  unpauseBridgeCustomer,
);

// ── Inactive Bridge customers (VA fee cost review) ───────────
router.get(
  '/bridge/inactive-customers',
  validateRequest({ query: inactiveBridgeCustomersQuerySchema }),
  listInactiveBridgeCustomers,
);
router.post(
  '/bridge/inactive-customers/notify',
  validateRequest({ query: inactiveBridgeCustomersQuerySchema }),
  notifyInactiveBridgeCustomers,
);
router.post(
  '/bridge/customers/:userId/delete',
  validateRequest({ params: bridgeCostDeleteUserParamSchema }),
  deleteBridgeCustomerForCostSavings,
);

export const adminRouter = router;
