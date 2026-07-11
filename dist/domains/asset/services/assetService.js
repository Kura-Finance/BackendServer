"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetService = void 0;
const prisma_1 = require("../../shared/lib/prisma");
const fieldEncryption_1 = require("../../shared/lib/fieldEncryption");
/**
 * 資產服務 - 資產追蹤業務邏輯
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
                value: fieldEncryption_1.FieldEncryption.encryptNumber(snapshot.value),
                currency: snapshot.currency || 'USD',
                recordedAt,
            },
        });
        // 更新 AssetPerformance：只取各 assetId 最新一筆加總，避免多次記錄後數字膨脹
        const totalAssets = await AssetService.computeCurrentTotalAssets(userId);
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: { totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
            create: { userId, totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
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
                value: fieldEncryption_1.FieldEncryption.encryptNumber(snapshot.value),
                currency: snapshot.currency || 'USD',
                recordedAt,
            },
        })));
        // 更新 AssetPerformance：只取各 assetId 最新一筆加總，避免多次記錄後數字膨脹
        const totalAssets = await AssetService.computeCurrentTotalAssets(userId);
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: { totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
            create: { userId, totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
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
        // 構建時間序列數據
        // 以「整點小時」為 bucket key，將同一批次寫入的多個帳戶快照合併成一個總資產數據點
        const historyMap = new Map();
        snapshots.forEach((snapshot) => {
            const d = new Date(snapshot.recordedAt);
            d.setMinutes(0, 0, 0);
            const bucketKey = d.toISOString();
            const decryptedValue = fieldEncryption_1.FieldEncryption.decryptNumber(snapshot.value);
            const existing = historyMap.get(bucketKey);
            historyMap.set(bucketKey, {
                value: (existing?.value ?? 0) + decryptedValue,
                ts: existing?.ts ?? d,
            });
        });
        // 轉換為陣列格式，按時間升序排列
        const history = Array.from(historyMap.values())
            .sort((a, b) => a.ts.getTime() - b.ts.getTime())
            .map(({ ts, value }) => ({
            timestamp: ts,
            value,
            assetId: '',
            name: 'Total Assets',
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
            totalAssets: performance?.totalAssets ? fieldEncryption_1.FieldEncryption.decryptNumber(performance.totalAssets) : 0,
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
        const totalAssets = allSnapshots.reduce((sum, s) => sum + fieldEncryption_1.FieldEncryption.decryptNumber(s.value), 0);
        const lastRecordedTime = allSnapshots.length > 0
            ? new Date(Math.max(...allSnapshots.map((s) => s.recordedAt.getTime())))
            : null;
        await prisma_1.prisma.assetPerformance.upsert({
            where: { userId },
            update: {
                totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets),
                lastRecordedTime,
            },
            create: {
                userId,
                totalAssets: fieldEncryption_1.FieldEncryption.encryptNumber(totalAssets),
                lastRecordedTime,
            },
        });
        return result.count;
    }
    /**
     * 計算用戶當前各資產最新快照的總資產值
     * 只取每個 assetId 最新一筆，避免累加歷史數據導致數字膨脹
     */
    static async computeCurrentTotalAssets(userId) {
        const latestPerAsset = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
            orderBy: { recordedAt: 'desc' },
            distinct: ['assetId'],
        });
        return latestPerAsset.reduce((sum, s) => sum + fieldEncryption_1.FieldEncryption.decryptNumber(s.value), 0);
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
    // 輔助方法
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