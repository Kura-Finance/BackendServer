import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import * as ExchangeController from './controllers/exchangeController';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  connectExchangeBodySchema,
  exchangeAccountIdParamsSchema,
} from './schemas/exchangeSchemas';

const router = Router();

// 所有交易所路由都需要驗證（包含 /supported；若未來需要公開，把這條路由
// 註冊在 router.use(requireAuth) 之前即可）
router.use(requireAuth);

/**
 * GET /api/exchange/supported
 * 獲取支持的交易所列表（目前需要登入）
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
 * 取得特定交易所帳戶的「加密形式」餘額 + 資產（Phase 3 Zero-Access E2EE only）。
 * - 觸發 CCXT 同步 → 加密寫快取 → 回讀加密 row
 * - 達到查詢上限時，回退讀本地加密快取
 * 返回: { account, payloadKeys[], balances[], assets[] }
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
