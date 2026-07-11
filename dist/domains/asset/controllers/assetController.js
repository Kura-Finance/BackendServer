"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordDates = exports.deleteAssetHistory = exports.getAssetHistory = exports.getLatestSnapshot = exports.recordMultipleSnapshots = exports.recordAssetSnapshot = void 0;
const assetService_1 = require("../services/assetService");
const logger_1 = require("../../logger");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * Asset Controller - Request/Response Handling
 */
/**
 * 記錄資產快照
 */
const recordAssetSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { assetId, name, type, value, currency } = req.body;
        const snapshot = {
            assetId,
            name,
            type,
            value: parseFloat(value),
            currency: currency || 'USD',
            recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
        };
        const result = await assetService_1.AssetService.recordAssetSnapshot(req.userId, snapshot);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Record asset snapshot failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.recordAssetSnapshot = recordAssetSnapshot;
/**
 * 批量記錄資產快照
 */
const recordMultipleSnapshots = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { snapshots } = req.body;
        const snapshotData = snapshots.map((s) => ({
            assetId: s.assetId,
            name: s.name,
            type: s.type,
            value: parseFloat(s.value),
            currency: s.currency || 'USD',
            recordedAt: s.recordedAt ? new Date(s.recordedAt) : new Date(),
        }));
        const results = await assetService_1.AssetService.recordMultipleSnapshots(req.userId, snapshotData);
        (0, apiResponse_1.sendSuccess)(res, results);
    }
    catch (error) {
        (0, logger_1.logError)('Record multiple snapshots failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.recordMultipleSnapshots = recordMultipleSnapshots;
/**
 * 獲取最新資產狀態
 */
const getLatestSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const snapshots = await assetService_1.AssetService.getLatestSnapshot(req.userId);
        if (!snapshots) {
            (0, apiResponse_1.sendSuccess)(res, {
                message: 'No asset records found',
                data: [],
            });
            return;
        }
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Latest asset snapshot fetched successfully',
            data: snapshots,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get latest snapshot failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.getLatestSnapshot = getLatestSnapshot;
/**
 * 獲取資產歷史數據（用於繪製圖表）
 */
const getAssetHistory = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const days = Number(req.query.days) || 30;
        const history = await assetService_1.AssetService.getAssetHistory(req.userId, Math.min(days, 365));
        (0, apiResponse_1.sendSuccess)(res, history);
    }
    catch (error) {
        (0, logger_1.logError)('Get asset history failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.getAssetHistory = getAssetHistory;
/**
 * 刪除特定資產的歷史記錄
 */
const deleteAssetHistory = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const assetId = req.params.assetId;
        const count = await assetService_1.AssetService.deleteAssetHistory(req.userId, assetId);
        (0, apiResponse_1.sendSuccess)(res, {
            message: `Deleted ${count} asset records`,
            deletedCount: count,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Delete asset history failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
};
exports.deleteAssetHistory = deleteAssetHistory;
/**
 * 獲取所有記錄日期（用於前端日期選擇器）
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