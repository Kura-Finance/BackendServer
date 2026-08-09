/**
 * Admin APIs — requireAuth + requireAdmin (ADMIN_EMAILS / ADMIN_EMAIL).
 * Base path: /api/admin
 * Bridge / LI.FI sub-routes also require the matching flag in src/config/features.ts.
 */

import { Router } from 'express';
import { requireFeature } from '../../config/features';
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
  requireFeature('bridge'),
  validateRequest({ params: userIdParamSchema }),
  clearUserFraudSuspend,
);
router.get('/overview', getOverview);
router.get('/earn/fee-warps', getFeeWarps);
router.get('/lifi/summary', requireFeature('lifiAnalytics'), getLifiSummary);

// ── Bridge funds-request / Fraud Alert ops ───────────────────
const bridgeAdmin = Router();
bridgeAdmin.use(requireFeature('bridge'));

// Prefer GET/POST /refresh — some CDNs/WAFs challenge POST …/sync.
bridgeAdmin.get(
  '/funds-requests/refresh',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);
bridgeAdmin.post(
  '/funds-requests/refresh',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);
bridgeAdmin.post(
  '/funds-requests/sync',
  validateRequest({ query: lazyUpdateQuerySchema }),
  syncFundsRequests,
);

bridgeAdmin.get(
  '/funds-requests',
  validateRequest({ query: listFundsRequestsQuerySchema }),
  listFundsRequests,
);

bridgeAdmin.post(
  '/funds-requests/:id/return',
  validateRequest({ params: fundsRequestIdParamSchema }),
  initiateFundsRequestReturn,
);

bridgeAdmin.post(
  '/funds-requests/:id/pause',
  validateRequest({ params: fundsRequestIdParamSchema }),
  pauseFundsRequestCustomer,
);

bridgeAdmin.post(
  '/funds-requests/:id/remediate',
  validateRequest({ params: fundsRequestIdParamSchema }),
  remediateFundsRequest,
);

bridgeAdmin.get(
  '/fraud-rate',
  validateRequest({ query: fraudRateQuerySchema }),
  getFraudRate,
);

/** Alias — avoids WAF rules that match the literal path segment `fraud`. */
bridgeAdmin.get(
  '/penalty-box',
  validateRequest({ query: fraudRateQuerySchema }),
  getFraudRate,
);

bridgeAdmin.post(
  '/customers/:bridgeCustomerId/unpause',
  validateRequest({ params: bridgeCustomerIdParamSchema }),
  unpauseBridgeCustomer,
);

// ── Inactive Bridge customers (VA fee cost review) ───────────
bridgeAdmin.get(
  '/inactive-customers',
  validateRequest({ query: inactiveBridgeCustomersQuerySchema }),
  listInactiveBridgeCustomers,
);
bridgeAdmin.post(
  '/inactive-customers/notify',
  validateRequest({ query: inactiveBridgeCustomersQuerySchema }),
  notifyInactiveBridgeCustomers,
);
bridgeAdmin.post(
  '/customers/:userId/delete',
  validateRequest({ params: bridgeCostDeleteUserParamSchema }),
  deleteBridgeCustomerForCostSavings,
);

router.use('/bridge', bridgeAdmin);

export const adminRouter = router;
