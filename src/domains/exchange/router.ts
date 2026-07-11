import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import * as ExchangeController from './controllers/exchangeController';

const router = Router();

// 所有交易所路由都需要驗證
router.use(requireAuth);

/**
 * GET /api/exchange/supported
 * 獲取支持的交易所列表 (無需驗證，可移到上面 authMiddleware 之前)
 */
router.get('/supported', ExchangeController.getSupportedExchanges);

/**
 * POST /api/exchange/connect
 * 連結新的交易所帳戶
 * Body: { exchange, apiKey, apiSecret, passphrase? }
 */
router.post('/connect', ExchangeController.connectExchange);

/**
 * GET /api/exchange/accounts
 * 獲取用戶所有交易所帳戶
 */
router.get('/accounts', ExchangeController.getUserExchangeAccounts);

/**
 * GET /api/exchange/:exchangeAccountId/balances
 * 獲取特定交易所帳戶的餘額
 */
router.get('/:exchangeAccountId/balances', ExchangeController.getExchangeBalances);

/**
 * GET /api/exchange/:exchangeAccountId/assets
 * 獲取特定交易所帳戶的資產 (持倉)
 */
router.get('/:exchangeAccountId/assets', ExchangeController.getExchangeAssets);

/**
 * DELETE /api/exchange/:exchangeAccountId
 * 斷開交易所連接
 */
router.delete('/:exchangeAccountId', ExchangeController.disconnectExchange);

export default router;
