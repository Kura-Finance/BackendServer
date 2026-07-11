"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../auth/middleware/auth");
const ExchangeController = __importStar(require("./controllers/exchangeController"));
const validateRequest_1 = require("../shared/middleware/validateRequest");
const exchangeSchemas_1 = require("./schemas/exchangeSchemas");
const router = (0, express_1.Router)();
// 所有交易所路由都需要驗證
router.use(auth_1.requireAuth);
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
router.post('/connect', (0, validateRequest_1.validateRequest)({ body: exchangeSchemas_1.connectExchangeBodySchema }), ExchangeController.connectExchange);
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
router.get('/:exchangeAccountId/balances', (0, validateRequest_1.validateRequest)({ params: exchangeSchemas_1.exchangeAccountIdParamsSchema }), ExchangeController.getExchangeBalances);
/**
 * DELETE /api/exchange/:exchangeAccountId
 * 斷開交易所連接
 */
router.delete('/:exchangeAccountId', (0, validateRequest_1.validateRequest)({ params: exchangeSchemas_1.exchangeAccountIdParamsSchema }), ExchangeController.disconnectExchange);
exports.default = router;
//# sourceMappingURL=router.js.map