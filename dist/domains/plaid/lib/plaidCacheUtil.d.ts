/**
 * 是缓存已过期，需要更新
 * @param lastSyncedAt 上次同步时间（可以为 null）
 * @param cacheTtlSeconds 缓存 TTL（秒）
 * @returns true 表示缓存已过期，需要刷新
 */
export declare function isCacheExpired(lastSyncedAt: Date | null, cacheTtlSeconds: number): boolean;
/**
 * 获取或创建用户的同步日志记录
 */
export declare function getOrCreateSyncLog(userId: string): Promise<any>;
/**
 * 检查账户缓存是否需要刷新
 */
export declare function shouldRefreshAccountsCache(userId: string): Promise<boolean>;
/**
 * 检查交易缓存是否需要刷新
 */
export declare function shouldRefreshTransactionsCache(userId: string): Promise<boolean>;
/**
 * 检查投资缓存是否需要刷新
 */
export declare function shouldRefreshInvestmentsCache(userId: string): Promise<boolean>;
/**
 * 清空用户的所有 Plaid 缓存 (用于手动刷新)
 */
export declare function clearAllPlaidCache(userId: string): Promise<void>;
/**
 * 清空用户的账户缓存
 */
export declare function clearAccountsCache(userId: string): Promise<void>;
/**
 * 清空用户的交易缓存
 */
export declare function clearTransactionsCache(userId: string): Promise<void>;
/**
 * 清空用户的投资缓存
 */
export declare function clearInvestmentsCache(userId: string): Promise<void>;
/**
 * 更新同步时间戳
 */
export declare function updateSyncTimestamp(userId: string, type: 'accounts' | 'transactions' | 'investments', stats?: {
    total?: number;
}): Promise<void>;
/**
 * 批量插入或更新账户缓存
 */
export declare function upsertAccountsCache(userId: string, accounts: Array<{
    plaidItemId: string;
    accountId: string;
    name: string;
    balance: number;
    type: string;
    bucket: string;
    institutionName: string;
    logo?: string;
}>): Promise<number>;
/**
 * 批量插入或更新交易缓存
 */
export declare function upsertTransactionsCache(userId: string, transactions: Array<{
    accountId: string;
    transactionId: string;
    merchant: string;
    amount: string;
    category: string;
    type: string;
    date: string;
    month: string;
}>): Promise<number>;
/**
 * 批量插入或更新投资账户缓存
 */
export declare function upsertInvestmentAccountsCache(userId: string, investmentAccounts: Array<{
    accountId: string;
    name: string;
    institutionName: string;
    logo?: string;
}>): Promise<number>;
/**
 * 批量插入或更新投资持仓缓存
 */
export declare function upsertInvestmentsCache(userId: string, investments: Array<{
    accountId: string;
    investmentId: string;
    symbol: string;
    name: string;
    holdings: number;
    currentPrice: number;
    type: string;
    logo?: string;
}>): Promise<number>;
/**
 * 从缓存获取账户数据
 */
export declare function getAccountsFromCache(userId: string): Promise<any>;
/**
 * 从缓存获取交易数据（某个月份）
 */
export declare function getTransactionsFromCache(userId: string, month?: string): Promise<any>;
/**
 * 从缓存获取投资账户数据
 */
export declare function getInvestmentAccountsFromCache(userId: string): Promise<any>;
/**
 * 从缓存获取投资持仓数据
 */
export declare function getInvestmentsFromCache(userId: string): Promise<any>;
/**
 * 获取用户的缓存统计信息
 */
export declare function getCacheStats(userId: string): Promise<{
    accounts: any;
    transactions: any;
    investmentAccounts: any;
    investments: any;
    lastSynced: any;
    accountsSynced: any;
    transactionsSynced: any;
    investmentsSynced: any;
}>;
//# sourceMappingURL=plaidCacheUtil.d.ts.map