/**
 * Admin domain public exports (router, auth middleware, dashboard service).
 */

export { adminRouter } from './router';
export { requireAdmin, getAdminEmailAllowlist } from './middleware/requireAdmin';
export { AdminDashboardService } from './services/adminDashboardService';
export type {
  AdminUser,
  FeeWarpVault,
  LifiAdminSummary,
  OverviewMetrics,
  RevenueActivity,
  UserTier,
  BridgeKycStatus,
  DinariKycStatus,
} from './models/types';
