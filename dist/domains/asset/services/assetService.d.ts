import { AssetSnapshotData, AssetSnapshotResponse, AssetHistoryResponse } from '../models/types';
/**
 * Asset Service - Business Logic for Asset Tracking
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
     * 取得用户的所有记录日期 (用于前端日期选择器)
     */
    static getRecordDates(userId: string): Promise<Date[]>;
    private static formatSnapshot;
}
//# sourceMappingURL=assetService.d.ts.map