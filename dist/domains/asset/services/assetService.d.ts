import { AssetSnapshotData, AssetSnapshotResponse, AssetHistoryResponse } from '../models/types';
/**
 * 資產服務 - 資產追蹤業務邏輯
 */
export declare class AssetService {
    /**
     * 記錄資產快照
     */
    static recordAssetSnapshot(userId: string, snapshot: AssetSnapshotData): Promise<AssetSnapshotResponse>;
    /**
     * 批量記錄多個資產快照
     */
    static recordMultipleSnapshots(userId: string, snapshots: AssetSnapshotData[]): Promise<AssetSnapshotResponse[]>;
    /**
     * 獲取最新的資產快照（當前資產狀態）
     */
    static getLatestSnapshot(userId: string): Promise<AssetSnapshotResponse[] | null>;
    /**
     * 獲取資產歷史數據（用於繪製圖表）
     * @param userId 用户 ID
     * @param days 過去的天數 (預設 30 天)
     */
    static getAssetHistory(userId: string, days?: number): Promise<AssetHistoryResponse>;
    /**
     * 刪除特定資產的歷史記錄
     */
    static deleteAssetHistory(userId: string, assetId: string): Promise<number>;
    /**
     * 計算用戶當前各資產最新快照的總資產值
     * 只取每個 assetId 最新一筆，避免累加歷史數據導致數字膨脹
     */
    private static computeCurrentTotalAssets;
    /**
     * 取得用户的所有记录日期 (用于前端日期选择器)
     */
    static getRecordDates(userId: string): Promise<Date[]>;
    private static formatSnapshot;
}
//# sourceMappingURL=assetService.d.ts.map