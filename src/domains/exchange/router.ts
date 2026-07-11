import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import * as ExchangeController from './controllers/exchangeController';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  connectExchangeBodySchema,
  exchangeAccountIdParamsSchema,
} from './schemas/exchangeSchemas';

const router = Router();

/**
 * GET /api/exchange/supported
 * 獲取支持的交易所列表（公開：純靜態清單，不含任何使用者資料）。
 *
 * 刻意註冊在 router.use(requireAuth) 之前 → 前端在登入流程未完成 / token 尚未
 * 附上時也能載入「支援交易所」清單（例如 ExchangeLinkModal 開啟當下）。
 */
router.get('/supported', ExchangeController.getSupportedExchanges);

// 以下所有交易所路由都需要驗證
router.use(requireAuth);

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
