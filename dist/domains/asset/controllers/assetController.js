"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordDates = exports.getEncryptedAssetHistory = void 0;
const assetService_1 = require("../services/assetService");
const logger_1 = require("../../logger");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * Asset Controller (Phase 3 Zero-Access E2EE only)
 *
 * 自 PR 5 起：legacy 明文歷史路徑已移除。所有資產歷史一律走加密路徑：
 *   - `/api/assets/history/encrypted` (canonical)
 *   - `/api/assets/history`           (legacy-compatible alias)
 * 前端用 privateKey 解 payloadKeys → 解每個 snapshot row 後組合曲線。
 */
/**
 * 取得「加密形式」資產歷史
 *
 * 路由：GET /api/assets/history/encrypted?days=30  (與 /api/assets/history 別名等價)
 * Basic 會員最多 30 天；Pro / Ultimate / VIP 最多 365 天。
 *
 * 後端不解密，回傳：
 *   {
 *     userId,
 *     payloadKeys: [{ id, scope, wrappedSek, algorithm }, ...],
 *     snapshots:   [{ id, metric, recordedAt, payloadCiphertext, payloadKeyId }, ...]
 *   }
 *
 * 前端用 privateKey unwrap payloadKeys → 解每個 snapshot row 的 payloadCiphertext，
 * 自行組成 2-metric 時間序列（plaidInvestment / cryptoSpot）。
 *
 * - metric 字串：可能是 base 或 sub-scoped（{base}:{source}:{id}）
 * - 同 sub-scoped key 同一天取 recordedAt 最大者；同 base 跨 sub-scope 加總
 */
const getEncryptedAssetHistory = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const days = Number(req.query.days) || 30;
        const result = await assetService_1.AssetService.getEncryptedAssetHistory(req.userId, days);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Get encrypted asset history failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.getEncryptedAssetHistory = getEncryptedAssetHistory;
/**
 * 獲取所有記錄日期（用於前端日期選擇器）
 *
 * 路由：GET /api/assets/dates
 *
 * 只回傳 metadata（recordedAt），不涉及任何 payload 解密。
 */
const getRecordDates = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const dates = await assetService_1.AssetService.getRecordDates(req.userId);
        (0, apiResponse_1.sendSuccess)(res, {
            dates,
            count: dates.length,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get record dates failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.getRecordDates = getRecordDates;
//# sourceMappingURL=assetController.js.map