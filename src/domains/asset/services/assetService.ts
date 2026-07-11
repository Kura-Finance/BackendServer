import { prisma } from '../../shared/lib/prisma';
import {
  AssetSnapshotData,
  AssetSnapshotResponse,
  AssetHistoryResponse,
} from '../models/types';
import { FieldEncryption } from '../../shared/lib/fieldEncryption';

/**
 * 資產服務 - 資產追蹤業務邏輯
 */

export class AssetService {
  /**
   * 記錄資產快照
   */
  static async recordAssetSnapshot(
    userId: string,
    snapshot: AssetSnapshotData
  ): Promise<AssetSnapshotResponse> {
    const recordedAt = snapshot.recordedAt || new Date();

    const assetSnapshot = await prisma.assetSnapshot.create({
      data: {
        userId,
        assetId: snapshot.assetId,
        name: snapshot.name,
        type: snapshot.type,
        value: FieldEncryption.encryptNumber(snapshot.value),
        currency: snapshot.currency || 'USD',
        recordedAt,
      },
    });

    // 更新 AssetPerformance：只取各 assetId 最新一筆加總，避免多次記錄後數字膨脹
    const totalAssets = await AssetService.computeCurrentTotalAssets(userId);

    await prisma.assetPerformance.upsert({
      where: { userId },
      update: { totalAssets: FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
      create: { userId, totalAssets: FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
    });

    return this.formatSnapshot(assetSnapshot);
  }

  /**
   * 批量記錄多個資產快照
   */
  static async recordMultipleSnapshots(
    userId: string,
    snapshots: AssetSnapshotData[]
  ): Promise<AssetSnapshotResponse[]> {
    const recordedAt = new Date();

    const createdSnapshots = await Promise.all(
      snapshots.map((snapshot) =>
        prisma.assetSnapshot.create({
          data: {
            userId,
            assetId: snapshot.assetId,
            name: snapshot.name,
            type: snapshot.type,
            value: FieldEncryption.encryptNumber(snapshot.value),
            currency: snapshot.currency || 'USD',
            recordedAt,
          },
        })
      )
    );

    // 更新 AssetPerformance：只取各 assetId 最新一筆加總，避免多次記錄後數字膨脹
    const totalAssets = await AssetService.computeCurrentTotalAssets(userId);

    await prisma.assetPerformance.upsert({
      where: { userId },
      update: { totalAssets: FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
      create: { userId, totalAssets: FieldEncryption.encryptNumber(totalAssets), lastRecordedTime: recordedAt },
    });

    return createdSnapshots.map(this.formatSnapshot);
  }

  /**
   * 獲取最新的資產快照（當前資產狀態）
   */
  static async getLatestSnapshot(userId: string): Promise<AssetSnapshotResponse[] | null> {
    const snapshots = await (prisma.assetSnapshot as any).findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      take: 1,
    });

    if (snapshots.length === 0) return null;

    const latestTime = snapshots[0]!.recordedAt;

    const allLatest = await (prisma.assetSnapshot as any).findMany({
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
  static async getAssetHistory(userId: string, days: number = 30): Promise<AssetHistoryResponse> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await prisma.assetSnapshot.findMany({
      where: {
        userId,
        recordedAt: {
          gte: startDate,
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const performance = await prisma.assetPerformance.findUnique({
      where: { userId },
    });

    // 構建時間序列數據
    // 以「整點小時」為 bucket key，將同一批次寫入的多個帳戶快照合併成一個總資產數據點
    const historyMap = new Map<string, { value: number; ts: Date }>();

    snapshots.forEach((snapshot: any) => {
      const d = new Date(snapshot.recordedAt);
      d.setMinutes(0, 0, 0);
      const bucketKey = d.toISOString();
      const decryptedValue = FieldEncryption.decryptNumber(snapshot.value);
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
    const values = history.map((h: any) => h.value);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 0;
    const averageValue = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
    const currentValue: number = values.length > 0 ? (values[values.length - 1] ?? 0) : 0;
    const previousValue: number = values.length > 1 ? (values[0] ?? 0) : (currentValue ?? 0);
    const change = currentValue - previousValue;
    const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;

    return {
      userId,
      totalAssets: performance?.totalAssets ? FieldEncryption.decryptNumber(performance.totalAssets) : 0,
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
  static async deleteAssetHistory(userId: string, assetId: string): Promise<number> {
    const result = await prisma.assetSnapshot.deleteMany({
      where: {
        userId,
        assetId,
      },
    });

    // 重新計算 AssetPerformance
    const allSnapshots = await prisma.assetSnapshot.findMany({
      where: { userId },
    });

    const totalAssets = allSnapshots.reduce((sum: number, s: any) => sum + FieldEncryption.decryptNumber(s.value), 0);
    const lastRecordedTime =
      allSnapshots.length > 0
        ? new Date(Math.max(...allSnapshots.map((s: any) => s.recordedAt.getTime())))
        : null;

    await prisma.assetPerformance.upsert({
      where: { userId },
      update: {
        totalAssets: FieldEncryption.encryptNumber(totalAssets),
        lastRecordedTime,
      },
      create: {
        userId,
        totalAssets: FieldEncryption.encryptNumber(totalAssets),
        lastRecordedTime,
      },
    });

    return result.count;
  }

  /**
   * 計算用戶當前各資產最新快照的總資產值
   * 只取每個 assetId 最新一筆，避免累加歷史數據導致數字膨脹
   */
  private static async computeCurrentTotalAssets(userId: string): Promise<number> {
    const latestPerAsset = await prisma.assetSnapshot.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      distinct: ['assetId'],
    });
    return latestPerAsset.reduce((sum: number, s: any) => sum + FieldEncryption.decryptNumber(s.value), 0);
  }

  /**
   * 取得用户的所有记录日期 (用于前端日期选择器)
   */
  static async getRecordDates(userId: string): Promise<Date[]> {
    const snapshots = await prisma.assetSnapshot.findMany({
      where: { userId },
      distinct: ['recordedAt'],
      orderBy: { recordedAt: 'desc' },
    });

    return snapshots.map((s: any) => s.recordedAt);
  }

  // 輔助方法
  private static formatSnapshot(snapshot: any) {
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
