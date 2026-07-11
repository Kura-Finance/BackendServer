import { Router, Request, Response, NextFunction } from 'express';
import {
  createLinkToken,
  exchangePublicToken,
  disconnectPlaidItem,
  getFinanceSnapshotOptimized,
  getCacheInfo,
  handlePlaidWebhook,
} from './controllers/plaidController';
import { requireAuth } from '../auth/middleware/auth';
import { appLogger } from '../logger';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  disconnectPlaidItemBodySchema,
  exchangePublicTokenBodySchema,
  getFinanceSnapshotQuerySchema,
} from './schemas/plaidSchemas';

const router = Router();

/**
 * Plaid 路由錯誤處理中介層
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
 * 路由：POST /api/plaid/create-link-token
 * 功能：建立 Plaid 連線所需的 Link token
 * 驗證：需要登入
 */
router.post('/create-link-token', requireAuth, wrapAsync(createLinkToken));

/**
 * 路由：POST /api/plaid/exchange-public-token
 * 功能：交換 public token 取得 access token
 * 驗證：需要登入
 * 請求內容：{ public_token: string, institution_name?: string }
 */
router.post(
  '/exchange-public-token',
  requireAuth,
  validateRequest({ body: exchangePublicTokenBodySchema }),
  wrapAsync(exchangePublicToken),
);

/**
 * 路由：GET /api/plaid/finance-snapshot
 * 功能：取得財務快照（accounts、transactions、investments）
 * 預設使用快取，可用 ?refresh=true 手動刷新
 * 
 * 查詢參數：
 *   - refresh=true: 手動刷新 (受每日次數限制)
 * 
 * 限制邏輯：
 *   - 初次連接或緩存過期時的自動加載 → 不受限制
 *   - 用戶主動點擊刷新按鈕 (refresh=true) → 受每日上限限制
 * 
 * 回應內容：
 *   - accounts: 銀行帳戶列表
 *   - transactions: 交易記錄
 *   - investmentAccounts: 投資帳戶列表
 *   - investments: 投資持倉
 *   - _cacheSource: 數據來源提示 ('來自緩存' 或 '強制刷新，來自 Plaid API')
 * 
 * 錯誤代碼：
 *   - 429: 已達到每日刷新限制 (僅在手動刷新時出現)
 *   - 401: 未登入
 *   - 500: 內部錯誤
 * 
 * 驗證：需要登入
 */
router.get(
  '/finance-snapshot',
  requireAuth,
  validateRequest({ query: getFinanceSnapshotQuerySchema }),
  wrapAsync(getFinanceSnapshotOptimized),
);

/**
 * 路由：POST /api/plaid/disconnect-item
 * 功能：中斷 Plaid Item 連線（會移除整個 Item 底下所有帳戶）
 * 驗證：需要登入
 * 請求內容：{ accountId: string }
 */
router.post(
  '/disconnect-item',
  requireAuth,
  validateRequest({ body: disconnectPlaidItemBodySchema }),
  wrapAsync(disconnectPlaidItem),
);

/**
 * 路由：GET /api/plaid/cache/info
 * 功能：取得快取統計與同步資訊
 * 驗證：需要登入
 */
router.get('/cache/info', requireAuth, wrapAsync(getCacheInfo));

/**
 * 路由：POST /api/plaid/webhook
 * 功能：Plaid webhook 入口
 * 驗證：不需要（由 Plaid 服務呼叫）
 * Webhook 類型：ITEM、TRANSACTIONS、INVESTMENTS_TRANSACTIONS、AUTH
 */
router.post('/webhook', wrapAsync(handlePlaidWebhook));

export default router;
