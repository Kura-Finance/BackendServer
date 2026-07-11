import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
/**
 * Prisma client that callers may pass into the cache util helpers when they
 * want a sequence of writes to participate in an outer `prisma.$transaction`.
 * Defaults to the singleton client so existing single-statement callers stay
 * unchanged.
 */
export type CacheUtilDb = Prisma.TransactionClient | typeof prisma;
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
export declare function getOrCreateSyncLog(userId: string, db?: CacheUtilDb): Promise<any>;
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
}, db?: CacheUtilDb): Promise<void>;
/**
 * 批量同步 Plaid 帳戶快取（snapshot 模式：先 delete 後 insert）。
 * Plaid accounts API 永遠回完整列表，本函式保持「整體替換」語意。
 */
export declare function upsertAccountsCache(userId: string, accounts: Array<{
    plaidItemId: string;
    accountId: string;
    type: string;
    bucket: string;
    payloadCiphertext: string;
    payloadKeyId: string;
}>, db?: CacheUtilDb): Promise<number>;
/**
 * 批量同步 Plaid 交易快取（增量 upsert by transactionId）。
 *
 * 與 PR 5 之前的「by-month delete + insert」不同：
 *   - Plaid transactionsSync 為增量 API，只回 added / modified / removed
 *   - removedTransactionIds 由 caller 處理（在 fetchPlaintextFromPlaid 中直接 delete）
 *   - 既有未變更的 row 必須保留在 DB（其加密 payloadCiphertext 仍由舊 SEK 保護）
 */
export declare function upsertTransactionsCache(userId: string, transactions: Array<{
    accountId: string;
    transactionId: string;
    plaidItemId?: string | null;
    date: string;
    month: string;
    isPending?: boolean;
    isRecurring?: boolean;
    isSubscription?: boolean;
    payloadCiphertext: string;
    payloadKeyId: string;
}>, db?: CacheUtilDb): Promise<number>;
/**
 * 批量同步 Plaid 投資帳戶快取（snapshot 模式：先 delete 後 insert）。
 */
export declare function upsertInvestmentAccountsCache(userId: string, investmentAccounts: Array<{
    accountId: string;
    payloadCiphertext: string;
    payloadKeyId: string;
}>, db?: CacheUtilDb): Promise<number>;
/**
 * 批量同步 Plaid 投資持倉快取（snapshot 模式：先 delete 後 insert）。
 */
export declare function upsertInvestmentsCache(userId: string, investments: Array<{
    accountId: string;
    investmentId: string;
    type: string;
    payloadCiphertext: string;
    payloadKeyId: string;
}>, db?: CacheUtilDb): Promise<number>;
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