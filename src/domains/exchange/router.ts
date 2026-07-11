import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import * as ExchangeController from './controllers/exchangeController';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  connectExchangeBodySchema,
  exchangeAccountIdParamsSchema,
} from './schemas/exchangeSchemas';

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
router.post('/connect', validateRequest({ body: connectExchangeBodySchema }), ExchangeController.connectExchange);

/**
 * GET /api/exchange/accounts
 * 獲取用戶所有交易所帳戶
 */
router.get('/accounts', ExchangeController.getUserExchangeAccounts);

/**
 * GET /api/exchange/:exchangeAccountId/balances
 * 獲取特定交易所帳戶的餘額和資產 (合併端點)
 * 返回: { account, balances[], assets[], timestamp }
 */
router.get(
  '/:exchangeAccountId/balances',
  validateRequest({ params: exchangeAccountIdParamsSchema }),
  ExchangeController.getExchangeBalances,
);

/**
 * DELETE /api/exchange/:exchangeAccountId
 * 斷開交易所連接
 */
router.delete(
  '/:exchangeAccountId',
  validateRequest({ params: exchangeAccountIdParamsSchema }),
  ExchangeController.disconnectExchange,
);

export default router;
