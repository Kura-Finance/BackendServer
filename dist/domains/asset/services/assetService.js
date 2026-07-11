"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetService = void 0;
const prisma_1 = require("../../shared/lib/prisma");
/**
 * Asset Service - Business Logic for Asset Tracking
 */
class AssetService {
    /**
     * 記錄資產快照
     */
    static async recordAssetSnapshot(userId, snapshot) {
        const recordedAt = snapshot.recordedAt || new Date();
        const assetSnapshot = await prisma_1.prisma.assetSnapshot.create({
            data: {
                userId,
                assetId: snapshot.assetId,
                name: snapshot.name,
                type: snapshot.type,
                value: snapshot.value,
                currency: snapshot.currency || 'USD',
                recordedAt,
            },
        });
        // 更新 AssetPerformance 記錄
        const allSnapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
        });
        const totalAssets = allSnapshots.reduce((sum, s) => sum + s.value, 0);
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: {
                totalAssets,
                lastRecordedTime: recordedAt,
            },
            create: {
                userId,
                totalAssets,
                lastRecordedTime: recordedAt,
            },
        });
        return this.formatSnapshot(assetSnapshot);
    }
    /**
     * 批量記錄多個資產快照
     */
    static async recordMultipleSnapshots(userId, snapshots) {
        const recordedAt = new Date();
        const createdSnapshots = await Promise.all(snapshots.map((snapshot) => prisma_1.prisma.assetSnapshot.create({
            data: {
                userId,
                assetId: snapshot.assetId,
                name: snapshot.name,
                type: snapshot.type,
                value: snapshot.value,
                currency: snapshot.currency || 'USD',
                recordedAt,
            },
        })));
        // 更新 AssetPerformance 記錄
        const allSnapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
        });
        const totalAssets = allSnapshots.reduce((sum, s) => sum + s.value, 0);
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: {
                totalAssets,
                lastRecordedTime: recordedAt,
            },
            create: {
                userId,
                totalAssets,
                lastRecordedTime: recordedAt,
            },
        });
        return createdSnapshots.map(this.formatSnapshot);
    }
    /**
     * 獲取最新的資產快照（當前資產狀態）
     */
    static async getLatestSnapshot(userId) {
        const snapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
            orderBy: { recordedAt: 'desc' },
            take: 1,
        });
        if (snapshots.length === 0)
            return null;
        const latestTime = snapshots[0].recordedAt;
        const allLatest = await prisma_1.prisma.assetSnapshot.findMany({
            where: {
                userId,
                recordedAt: latestTime,
            },
        });
        return allLatest.map(this.formatSnapshot);
    }
    /**
     * 獲取資產歷史數據（用於繪製圖表）
     * @param userId 用户 ID
     * @param days 過去的天數 (預設 30 天)
     */
    static async getAssetHistory(userId, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const snapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: {
                userId,
                recordedAt: {
                    gte: startDate,
                },
            },
            orderBy: { recordedAt: 'asc' },
        });
        const performance = await prisma_1.prisma.assetPerformance.findUnique({
            where: { userId },
        });
        // 構建時間序列數據（按時間聚合）
        const historyMap = new Map();
        const assetMap = new Map();
        snapshots.forEach((snapshot) => {
            const timestamp = snapshot.recordedAt.toISOString();
            const currentValue = historyMap.get(timestamp) || 0;
            historyMap.set(timestamp, currentValue + snapshot.value);
            assetMap.set(snapshot.assetId, {
                name: snapshot.name,
                type: snapshot.type,
            });
        });
        // 轉換為陣列格式
        const history = Array.from(historyMap.entries()).map(([timestamp, value]) => ({
            timestamp: new Date(timestamp),
            value,
            assetId: '',
            name: '總資產',
            type: 'total',
        }));
        // 計算統計數據
        const values = history.map((h) => h.value);
        const minValue = values.length > 0 ? Math.min(...values) : 0;
        const maxValue = values.length > 0 ? Math.max(...values) : 0;
        const averageValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const currentValue = values.length > 0 ? (values[values.length - 1] ?? 0) : 0;
        const previousValue = values.length > 1 ? (values[0] ?? 0) : (currentValue ?? 0);
        const change = currentValue - previousValue;
        const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;
        return {
            userId,
            totalAssets: performance?.totalAssets || 0,
            lastRecordedTime: performance?.lastRecordedTime || null,
            history,
            summary: {
                minValue,
                maxValue,
                averageValue,
                change,
                changePercent,
            },
        };
    }
    /**
     * 刪除特定資產的歷史記錄
     */
    static async deleteAssetHistory(userId, assetId) {
        const result = await prisma_1.prisma.assetSnapshot.deleteMany({
            where: {
                userId,
                assetId,
            },
        });
        // 重新計算 AssetPerformance
        const allSnapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
        });
        const totalAssets = allSnapshots.reduce((sum, s) => sum + s.value, 0);
        const lastRecordedTime = allSnapshots.length > 0
            ? new Date(Math.max(...allSnapshots.map((s) => s.recordedAt.getTime())))
            : null;
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: {
                totalAssets,
                lastRecordedTime,
            },
            create: {
                userId,
                totalAssets,
                lastRecordedTime,
            },
        });
        return result.count;
    }
    /**
     * 取得用户的所有记录日期 (用于前端日期选择器)
     */
    static async getRecordDates(userId) {
        const snapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
            distinct: ['recordedAt'],
            orderBy: { recordedAt: 'desc' },
        });
        return snapshots.map((s) => s.recordedAt);
    }
    // Helper method
    static formatSnapshot(snapshot) {
        return {
            id: snapshot.id,
            assetId: snapshot.assetId,
            name: snapshot.name,
            type: snapshot.type,
            value: snapshot.value,
            currency: snapshot.currency,
            recordedAt: snapshot.recordedAt,
            createdAt: snapshot.createdAt,
        };
    }
}
exports.AssetService = AssetService;
//# sourceMappingURL=assetService.js.map