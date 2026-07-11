"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assetController_1 = require("./controllers/assetController");
const auth_1 = require("../auth/middleware/auth");
const router = (0, express_1.Router)();
/**
 * Asset Routes (All require authentication)
 */
// 記錄單個資產快照
router.post('/snapshot', auth_1.requireAuth, assetController_1.recordAssetSnapshot);
// 批量記錄資產快照
router.post('/snapshots', auth_1.requireAuth, assetController_1.recordMultipleSnapshots);
// 獲取最新資產狀態
router.get('/latest', auth_1.requireAuth, assetController_1.getLatestSnapshot);
// 獲取資產歷史數據 (用於繪製圖表)
// Query: ?days=30 (預設 30 天, 最多 365 天)
router.get('/history', auth_1.requireAuth, assetController_1.getAssetHistory);
// 獲取所有記錄日期
router.get('/dates', auth_1.requireAuth, assetController_1.getRecordDates);
// 刪除特定資產的歷史記錄
router.delete('/:assetId', auth_1.requireAuth, assetController_1.deleteAssetHistory);
exports.default = router;
//# sourceMappingURL=router.js.map