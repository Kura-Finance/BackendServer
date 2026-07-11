"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assetController_1 = require("./controllers/assetController");
const auth_1 = require("../auth/middleware/auth");
const validateRequest_1 = require("../shared/middleware/validateRequest");
const assetSchemas_1 = require("./schemas/assetSchemas");
const router = (0, express_1.Router)();
/**
 * 資產路由（全部需要驗證）— Phase 3 Zero-Access E2EE only
 *
 * 自 PR 5 起：所有 asset history 均為加密形式。
 * `/history` 保留作為 `/history/encrypted` 的相容性別名，避免前端 404。
 */
// 取得「加密形式」資產歷史（canonical path + legacy alias）
// 查詢參數：?days=30（預設 30 天，最多 365 天）
router.get(['/history/encrypted', '/history'], auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ query: assetSchemas_1.getAssetHistoryQuerySchema }), assetController_1.getEncryptedAssetHistory);
// 取得所有記錄日期（metadata only）
router.get('/dates', auth_1.requireAuth, assetController_1.getRecordDates);
exports.default = router;
//# sourceMappingURL=router.js.map