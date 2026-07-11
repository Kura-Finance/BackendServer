import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { requireDinariWhitelist } from './middleware/requireDinariWhitelist';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  connectWallet,
  createKycEmbed,
  getAccount,
  getCashBalances,
  getEntityStatus,
  getOrder,
  getOrderRequest,
  getPortfolio,
  getStockPrice,
  getStockQuote,
  getWalletNonce,
  listOrders,
  listStocks,
  mintSandboxTokens,
  prepareOrder,
  submitOrder,
} from './controllers/dinariController';
import {
  ensureEntityBodySchema,
  listStocksQuerySchema,
  orderIdParamSchema,
  prepareMarketOrderBodySchema,
  stockIdParamSchema,
  submitOrderBodySchema,
  walletConnectBodySchema,
  walletNonceBodySchema,
} from './schemas/dinariSchemas';

const router = Router();

const wrapAsync = (fn: (req: any, res: Response, next?: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      appLogger.error('Dinari router error', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};

// ── KYC / Entity（僅白名單測試帳可註冊 / 走 KYC）────────────────────────
router.get('/entity', requireAuth, requireDinariWhitelist, wrapAsync(getEntityStatus));
router.post(
  '/kyc-link',
  requireAuth,
  requireDinariWhitelist,
  validateRequest({ body: ensureEntityBodySchema }),
  wrapAsync(createKycEmbed),
);

// ── Account / Wallet ────────────────────────────────────────────────
router.get('/account', requireAuth, wrapAsync(getAccount));
router.post(
  '/wallet/nonce',
  requireAuth,
  validateRequest({ body: walletNonceBodySchema }),
  wrapAsync(getWalletNonce),
);
router.post(
  '/wallet/connect',
  requireAuth,
  validateRequest({ body: walletConnectBodySchema }),
  wrapAsync(connectWallet),
);

// ── 行情 ──────────────────────────────────────────────────────────────
router.get(
  '/stocks',
  requireAuth,
  validateRequest({ query: listStocksQuerySchema }),
  wrapAsync(listStocks),
);
router.get(
  '/stocks/:stockId/price',
  requireAuth,
  validateRequest({ params: stockIdParamSchema }),
  wrapAsync(getStockPrice),
);
router.get(
  '/stocks/:stockId/quote',
  requireAuth,
  validateRequest({ params: stockIdParamSchema }),
  wrapAsync(getStockQuote),
);

// ── 下單（市價，EIP155 自管錢包）────────────────────────────────────
router.post(
  '/orders/prepare',
  requireAuth,
  validateRequest({ body: prepareMarketOrderBodySchema }),
  wrapAsync(prepareOrder),
);
router.post(
  '/orders/submit',
  requireAuth,
  validateRequest({ body: submitOrderBodySchema }),
  wrapAsync(submitOrder),
);
router.get('/orders', requireAuth, wrapAsync(listOrders));
router.get('/order-requests/:orderRequestId', requireAuth, wrapAsync(getOrderRequest));
router.get(
  '/orders/:orderId',
  requireAuth,
  validateRequest({ params: orderIdParamSchema }),
  wrapAsync(getOrder),
);

// ── 持倉 / 現金 / Sandbox ────────────────────────────────────────────
router.get('/portfolio', requireAuth, wrapAsync(getPortfolio));
router.get('/cash', requireAuth, wrapAsync(getCashBalances));
router.post('/sandbox/faucet', requireAuth, wrapAsync(mintSandboxTokens));

export default router;
