"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordDates = exports.deleteAssetHistory = exports.getAssetHistory = exports.getLatestSnapshot = exports.recordMultipleSnapshots = exports.recordAssetSnapshot = void 0;
const assetService_1 = require("../services/assetService");
const logger_1 = require("../../logger");
/**
 * Asset Controller - Request/Response Handling
 */
/**
 * 記錄資產快照
 */
const recordAssetSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { assetId, name, type, value, currency } = req.body;
        if (!assetId || !name || !type || value === undefined) {
            res.status(400).json({
                error: '缺少必要欄位: assetId, name, type, value',
            });
            return;
        }
        const snapshot = {
            assetId,
            name,
            type,
            value: parseFloat(value),
            currency: currency || 'USD',
            recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
        };
        const result = await assetService_1.AssetService.recordAssetSnapshot(req.userId, snapshot);
        res.json(result);
    }
    catch (error) {
        (0, logger_1.logError)('Record asset snapshot failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.recordAssetSnapshot = recordAssetSnapshot;
/**
 * 批量記錄資產快照
 */
const recordMultipleSnapshots = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { snapshots } = req.body;
        if (!Array.isArray(snapshots) || snapshots.length === 0) {
            res.status(400).json({ error: 'snapshots 必須是非空陣列' });
            return;
        }
        const snapshotData = snapshots.map((s) => ({
            assetId: s.assetId,
            name: s.name,
            type: s.type,
            value: parseFloat(s.value),
            currency: s.currency || 'USD',
            recordedAt: s.recordedAt ? new Date(s.recordedAt) : new Date(),
        }));
        const results = await assetService_1.AssetService.recordMultipleSnapshots(req.userId, snapshotData);
        res.json(results);
    }
    catch (error) {
        (0, logger_1.logError)('Record multiple snapshots failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.recordMultipleSnapshots = recordMultipleSnapshots;
/**
 * 獲取最新資產狀態
 */
const getLatestSnapshot = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const snapshots = await assetService_1.AssetService.getLatestSnapshot(req.userId);
        if (!snapshots) {
            res.json({
                message: '尚無資產紀錄',
                data: [],
            });
            return;
        }
        res.json({
            message: '成功取得最新資產狀態',
            data: snapshots,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get latest snapshot failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.getLatestSnapshot = getLatestSnapshot;
/**
 * 獲取資產歷史數據（用於繪製圖表）
 */
const getAssetHistory = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const days = parseInt(req.query.days) || 30;
        const history = await assetService_1.AssetService.getAssetHistory(req.userId, Math.min(days, 365));
        res.json(history);
    }
    catch (error) {
        (0, logger_1.logError)('Get asset history failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.getAssetHistory = getAssetHistory;
/**
 * 刪除特定資產的歷史記錄
 */
const deleteAssetHistory = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const assetId = typeof req.params.assetId === 'string' ? req.params.assetId : '';
        if (!assetId) {
            res.status(400).json({ error: 'assetId 不能為空' });
            return;
        }
        const count = await assetService_1.AssetService.deleteAssetHistory(req.userId, assetId);
        res.json({
            message: `已刪除 ${count} 筆資產紀錄`,
            deletedCount: count,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Delete asset history failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.deleteAssetHistory = deleteAssetHistory;
/**
 * 獲取所有記錄日期（用於前端日期選擇器）
 */
const getRecordDates = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const dates = await assetService_1.AssetService.getRecordDates(req.userId);
        res.json({
            dates,
            count: dates.length,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get record dates failed', error, { userId: req.userId });
        res.status(500).json({ error: '伺服器錯誤' });
    }
};
exports.getRecordDates = getRecordDates;
//# sourceMappingURL=assetController.js.map