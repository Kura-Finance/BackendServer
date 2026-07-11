/**
 * API 操作類型
 */
export type ApiOperationType = 'exchange_connect' | 'exchange_balance' | 'plaid_refresh' | 'debank_refresh';
/**
 * 獲取用戶的訂閱等級
 */
export declare function getUserTier(userId: string): Promise<string>;
/**
 * 獲取特定操作的每日限制
 */
export declare function getApiLimitForTier(operationType: ApiOperationType, tier: string): number;
/** TrackFi 歷史查詢天數上限（依訂閱等級；未知 tier 視同 Basic） */
export declare function getAssetHistoryDaysLimitForTier(tier: string): number;
/** 將請求的 days 限制在 tier 上限與全域 365 天內 */
export declare function clampAssetHistoryDays(requestedDays: number, tier: string): number;
/**
 * 取得今天的日期字串（YYYY-MM-DD）
 */
export declare function getTodayDateString(): string;
/**
 * 獲取用戶今天特定操作的次數
 */
export declare function getTodayOperationCount(userId: string, operationType: ApiOperationType): Promise<number>;
/**
 * 檢查用戶是否可以執行特定操作
 * @returns { canOperate: boolean, operationCountRemaining: number, operationLimit: number, message?: string }
 */
export declare function checkApiLimit(userId: string, operationType: ApiOperationType): Promise<{
    canOperate: boolean;
    operationCountRemaining: number;
    operationLimit: number;
    message?: string;
}>;
/**
 * 記錄一次 API 操作
 */
export declare function recordApiOperation(userId: string, operationType: ApiOperationType): Promise<void>;
/**
 * ============================================
 * Plaid 特定函數（向後相容）
 * ============================================
 * 這些函數為了相容舊代碼而保留
 * @deprecated 使用通用 API 操作函數代替
 */
/**
 * 獲取用戶的每日 Plaid 刷新限制
 * @deprecated 使用 getApiLimitForTier('plaid_refresh', tier) 替代
 */
export declare function getRefreshLimitForTier(tier: string): number;
/**
 * 獲取用戶今天的 Plaid 刷新次數
 * @deprecated 使用 getTodayOperationCount(userId, 'plaid_refresh') 替代
 */
export declare function getTodayRefreshCount(userId: string): Promise<number>;
/**
 * 檢查用戶是否可以執行 Plaid 刷新
 * @deprecated 使用 checkApiLimit(userId, 'plaid_refresh') 替代
 */
export declare function checkRefreshLimit(userId: string): Promise<{
    canRefresh: boolean;
    refreshCountRemaining: number;
    refreshLimit: number;
    message?: string;
}>;
/**
 * 記錄一次 Plaid 刷新操作
 * @deprecated 使用 recordApiOperation(userId, 'plaid_refresh') 替代
 */
export declare function recordRefresh(userId: string): Promise<void>;
/**
 * ============================================
 * 管理員函數
 * ============================================
 */
/**
 * 更新用戶的訂閱等級
 * 驗證新等級的有效性，並記錄審計日誌
 */
export declare function updateUserTier(userId: string, newTier: string, adminId?: string): Promise<{
    previousTier: string;
    newTier: string;
}>;
//# sourceMappingURL=apiRateLimitUtil.d.ts.map