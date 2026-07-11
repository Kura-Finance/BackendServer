"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const plaidController_1 = require("./controllers/plaidController");
const auth_1 = require("../auth/middleware/auth");
const logger_1 = require("../logger");
const validateRequest_1 = require("../shared/middleware/validateRequest");
const plaidSchemas_1 = require("./schemas/plaidSchemas");
const router = (0, express_1.Router)();
/**
 * Plaid 路由錯誤處理中介層
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
 * 路由：POST /api/plaid/create-link-token
 * 功能：建立 Plaid 連線所需的 Link token
 * 驗證：需要登入
 */
router.post('/create-link-token', auth_1.requireAuth, wrapAsync(plaidController_1.createLinkToken));
/**
 * 路由：POST /api/plaid/exchange-public-token
 * 功能：交換 public token 取得 access token
 * 驗證：需要登入
 * 請求內容：{ public_token: string, institution_name?: string }
 */
router.post('/exchange-public-token', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: plaidSchemas_1.exchangePublicTokenBodySchema }), wrapAsync(plaidController_1.exchangePublicToken));
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
router.get('/finance-snapshot', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ query: plaidSchemas_1.getFinanceSnapshotQuerySchema }), wrapAsync(plaidController_1.getFinanceSnapshotOptimized));
/**
 * 路由：POST /api/plaid/disconnect-item
 * 功能：中斷 Plaid Item 連線（會移除整個 Item 底下所有帳戶）
 * 驗證：需要登入
 * 請求內容：{ accountId: string }
 */
router.post('/disconnect-item', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: plaidSchemas_1.disconnectPlaidItemBodySchema }), wrapAsync(plaidController_1.disconnectPlaidItem));
/**
 * 路由：GET /api/plaid/cache/info
 * 功能：取得快取統計與同步資訊
 * 驗證：需要登入
 */
router.get('/cache/info', auth_1.requireAuth, wrapAsync(plaidController_1.getCacheInfo));
/**
 * 路由：POST /api/plaid/webhook
 * 功能：Plaid webhook 入口
 * 驗證：不需要（由 Plaid 服務呼叫）
 * Webhook 類型：ITEM、TRANSACTIONS、INVESTMENTS_TRANSACTIONS、AUTH
 */
router.post('/webhook', wrapAsync(plaidController_1.handlePlaidWebhook));
exports.default = router;
//# sourceMappingURL=router.js.map