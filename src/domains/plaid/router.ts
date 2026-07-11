import { Router, Request, Response, NextFunction } from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  disconnectPlaidAccount,
  getFinanceSnapshotOptimized,
  updatePlaidAccountOrder,
  getCacheInfo,
  handlePlaidWebhook,
} from './controllers/plaidController';
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
 * Uses cache by default, with optional force refresh via ?refresh=true
 * 
 * Query Parameters:
 *   - refresh=true: Force refresh from Plaid API (受每日次數限制)
 * 
 * Response:
 *   - accounts: 銀行帳戶列表
 *   - transactions: 交易記錄
 *   - investmentAccounts: 投資帳戶列表
 *   - investments: 投資持倉
 *   - _cacheSource: 數據來源提示 ('來自緩存' 或 '強制刷新，來自 Plaid API')
 * 
 * Error Codes:
 *   - 429: 已達到每日刷新限制
 *   - 401: 未登入
 *   - 500: 內部錯誤
 * 
 * Authentication: Required
 */
router.get('/finance-snapshot', requireAuth, wrapAsync(getFinanceSnapshotOptimized));

/**
 * POST /api/plaid/account-order
 * Update account order preferences
 * Authentication: Required
 * Body: { accountIds?: string[], investmentAccountIds?: string[] }
 */
router.post('/account-order', requireAuth, wrapAsync(updatePlaidAccountOrder));

/**
 * POST /api/plaid/disconnect
 * Disconnect a Plaid account
 * Authentication: Required
 * Body: { accountId: string }
 */
router.post('/disconnect', requireAuth, wrapAsync(disconnectPlaidAccount));

/**
 * GET /api/plaid/cache/info
 * Get cache statistics and sync information
 * Authentication: Required
 */
router.get('/cache/info', requireAuth, wrapAsync(getCacheInfo));

/**
 * POST /api/plaid/webhook
 * Plaid webhook endpoint
 * Authentication: NOT Required (called by Plaid service)
 * Webhook Types: ITEM, TRANSACTIONS, INVESTMENTS_TRANSACTIONS, AUTH
 */
router.post('/webhook', wrapAsync(handlePlaidWebhook));

export default router;
