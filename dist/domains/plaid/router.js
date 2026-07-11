"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const plaidController_1 = require("./controllers/plaidController");
const auth_1 = require("../auth/middleware/auth");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
/**
 * Error handling middleware for Plaid routes
 */
const wrapAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            logger_1.appLogger.error('Plaid router error', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    };
};
/**
 * POST /api/plaid/create-link-token
 * Create Link token for Plaid connection
 * Authentication: Required
 */
router.post('/create-link-token', auth_1.requireAuth, wrapAsync(plaidController_1.createLinkToken));
/**
 * POST /api/plaid/exchange-public-token
 * Exchange public token for access token
 * Authentication: Required
 * Body: { public_token: string, institution_name?: string }
 */
router.post('/exchange-public-token', auth_1.requireAuth, wrapAsync(plaidController_1.exchangePublicToken));
/**
 * GET /api/plaid/finance-snapshot
 * Get finance snapshot (accounts, transactions, investments)
 * Authentication: Required
 */
router.get('/finance-snapshot', auth_1.requireAuth, wrapAsync(plaidController_1.getFinanceSnapshot));
/**
 * POST /api/plaid/account-order
 * Update account order preferences
 * Authentication: Required
 * Body: { accountIds?: string[], investmentAccountIds?: string[] }
 */
router.post('/account-order', auth_1.requireAuth, wrapAsync(plaidController_1.updatePlaidAccountOrder));
/**
 * DELETE /api/plaid/account
 * Disconnect a Plaid account
 * Authentication: Required
 * Body: { accountId: string }
 */
router.post('/disconnect', auth_1.requireAuth, wrapAsync(plaidController_1.disconnectPlaidAccount));
/**
 * GET /api/plaid/finance-snapshot-optimized
 * Get finance snapshot with caching (optimized)
 * Query: ?refresh=true to force refresh
 * Authentication: Required
 */
router.get('/finance-snapshot-optimized', auth_1.requireAuth, wrapAsync(plaidController_1.getFinanceSnapshotOptimized));
/**
 * POST /api/plaid/cache/refresh
 * Manually refresh Plaid cache (force API call)
 * Authentication: Required
 */
router.post('/cache/refresh', auth_1.requireAuth, wrapAsync(plaidController_1.refreshPlaidCache));
/**
 * POST /api/plaid/cache/clear
 * Clear all Plaid cache completely
 * Authentication: Required
 */
router.post('/cache/clear', auth_1.requireAuth, wrapAsync(plaidController_1.clearPlaidCache));
/**
 * GET /api/plaid/cache/info
 * Get cache statistics and sync information
 * Authentication: Required
 */
router.get('/cache/info', auth_1.requireAuth, wrapAsync(plaidController_1.getCacheInfo));
/**
 * POST /api/plaid/webhook
 * Plaid webhook endpoint
 * Authentication: NOT Required (called by Plaid service)
 * Webhook Types: ITEM, TRANSACTIONS, INVESTMENTS_TRANSACTIONS, AUTH
 */
router.post('/webhook', wrapAsync(plaidController_1.handlePlaidWebhook));
exports.default = router;
//# sourceMappingURL=router.js.map