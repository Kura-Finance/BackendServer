/**
 * Plaid 快取服務
 * 協調快取、同步與財務快照相關操作
 */
import { FinanceSnapshot } from '../models/types';
export declare class PlaidCacheService {
    /**
     * 獲取財務快照（優化版-支持緩存）
     * 優先使用緩存，必要時調用 API
     */
    static getFinanceSnapshotOptimized(userId: string, isManualRefresh?: boolean): Promise<FinanceSnapshot>;
    /**
     * 從緩存取得財務快照
     */
    private static getSnapshotFromCache;
    /**
     * 取得完整財務快照（從 Plaid API）
     */
    static getFinanceSnapshot(userId: string): Promise<FinanceSnapshot>;
    /**
     * 將財務快照保存到緩存
     */
    private static saveFinanceSnapshotToCache;
}
//# sourceMappingURL=plaidCacheService.d.ts.map