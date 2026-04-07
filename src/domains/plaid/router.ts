import { Router, Request, Response, NextFunction } from 'express';
import { createLinkToken, exchangePublicToken, disconnectPlaidAccount, getFinanceSnapshot, updatePlaidAccountOrder } from './controllers/plaidController';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';

const router = Router();

/**
 * Error handling middleware for Plaid routes
 */
const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Plaid router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

/**
 * POST /api/plaid/create-link-token
 * Create Link token for Plaid connection
 * Authentication: Required
 */
router.post('/create-link-token', requireAuth, wrapAsync(createLinkToken));

/**
 * POST /api/plaid/exchange-public-token
 * Exchange public token for access token
 * Authentication: Required
 * Body: { public_token: string, institution_name?: string }
 */
router.post('/exchange-public-token', requireAuth, wrapAsync(exchangePublicToken));

/**
 * GET /api/plaid/finance-snapshot
 * Get finance snapshot (accounts, transactions, investments)
 * Authentication: Required
 */
router.get('/finance-snapshot', requireAuth, wrapAsync(getFinanceSnapshot));

/**
 * POST /api/plaid/account-order
 * Update account order preferences
 * Authentication: Required
 * Body: { accountIds?: string[], investmentAccountIds?: string[] }
 */
router.post('/account-order', requireAuth, wrapAsync(updatePlaidAccountOrder));

/**
 * DELETE /api/plaid/account
 * Disconnect a Plaid account
 * Authentication: Required
 * Body: { accountId: string }
 */
router.post('/disconnect', requireAuth, wrapAsync(disconnectPlaidAccount));

export default router;
