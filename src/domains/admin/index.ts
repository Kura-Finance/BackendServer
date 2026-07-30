/**
 * Admin domain public exports (router, auth middleware).
 */

export { adminRouter } from './router';
export { requireAdmin, getAdminEmailAllowlist } from './middleware/requireAdmin';
