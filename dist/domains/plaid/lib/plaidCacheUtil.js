"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCacheExpired = isCacheExpired;
exports.getOrCreateSyncLog = getOrCreateSyncLog;
exports.shouldRefreshAccountsCache = shouldRefreshAccountsCache;
exports.shouldRefreshTransactionsCache = shouldRefreshTransactionsCache;
exports.shouldRefreshInvestmentsCache = shouldRefreshInvestmentsCache;
exports.clearAllPlaidCache = clearAllPlaidCache;
exports.clearAccountsCache = clearAccountsCache;
exports.clearTransactionsCache = clearTransactionsCache;
exports.clearInvestmentsCache = clearInvestmentsCache;
exports.updateSyncTimestamp = updateSyncTimestamp;
exports.upsertAccountsCache = upsertAccountsCache;
exports.upsertTransactionsCache = upsertTransactionsCache;
exports.upsertInvestmentAccountsCache = upsertInvestmentAccountsCache;
exports.upsertInvestmentsCache = upsertInvestmentsCache;
exports.getAccountsFromCache = getAccountsFromCache;
exports.getTransactionsFromCache = getTransactionsFromCache;
exports.getInvestmentAccountsFromCache = getInvestmentAccountsFromCache;
exports.getInvestmentsFromCache = getInvestmentsFromCache;
exports.getCacheStats = getCacheStats;
const prisma_1 = require("../../shared/lib/prisma");
const logger_1 = require("../../logger");
/**
 * 是缓存已过期，需要更新
 * @param lastSyncedAt 上次同步时间（可以为 null）
 * @param cacheTtlSeconds 缓存 TTL（秒）
 * @returns true 表示缓存已过期，需要刷新
 */
function isCacheExpired(lastSyncedAt, cacheTtlSeconds) {
    if (!lastSyncedAt) {
        return true; // 没有之前的缓存，视为已过期
    }
    const now = new Date();
    const elapsedSeconds = (now.getTime() - lastSyncedAt.getTime()) / 1000;
    return elapsedSeconds > cacheTtlSeconds;
}
/**
 * 获取或创建用户的同步日志记录
 */
async function getOrCreateSyncLog(userId) {
    const prismaAny = prisma_1.prisma;
    const existingLog = await prismaAny.plaidSyncLog.findUnique({
        where: { userId },
    });
    if (existingLog) {
        return existingLog;
    }
    return await prismaAny.plaidSyncLog.create({
        data: { userId },
    });
}
/**
 * 检查账户缓存是否需要刷新
 */
async function shouldRefreshAccountsCache(userId) {
    const syncLog = await getOrCreateSyncLog(userId);
    return isCacheExpired(syncLog.accountsSyncedAt, syncLog.accountsCacheTtl);
}
/**
 * 检查交易缓存是否需要刷新
 */
async function shouldRefreshTransactionsCache(userId) {
    const syncLog = await getOrCreateSyncLog(userId);
    return isCacheExpired(syncLog.transactionsSyncedAt, syncLog.transactionsCacheTtl);
}
/**
 * 检查投资缓存是否需要刷新
 */
async function shouldRefreshInvestmentsCache(userId) {
    const syncLog = await getOrCreateSyncLog(userId);
    return isCacheExpired(syncLog.investmentsSyncedAt, syncLog.investmentsCacheTtl);
}
/**
 * 清空用户的所有 Plaid 缓存 (用于手动刷新)
 */
async function clearAllPlaidCache(userId) {
    const prismaAny = prisma_1.prisma;
    await Promise.all([
        prismaAny.plaidAccountCache.deleteMany({ where: { userId } }),
        prismaAny.plaidTransactionCache.deleteMany({ where: { userId } }),
        prismaAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
        prismaAny.plaidInvestmentCache.deleteMany({ where: { userId } }),
    ]);
    // 重置同步时间
    await prismaAny.plaidSyncLog.update({
        where: { userId },
        data: {
            lastSyncedAt: null,
            accountsSyncedAt: null,
            transactionsSyncedAt: null,
            investmentsSyncedAt: null,
            totalAccounts: 0,
            totalTransactions: 0,
            totalInvestments: 0,
        },
    });
    (0, logger_1.logDebug)('Cleared all Plaid cache', { userId });
}
/**
 * 清空用户的账户缓存
 */
async function clearAccountsCache(userId) {
    const prismaAny = prisma_1.prisma;
    await prismaAny.plaidAccountCache.deleteMany({ where: { userId } });
    await prismaAny.plaidSyncLog.update({
        where: { userId },
        data: { accountsSyncedAt: null, totalAccounts: 0 },
    });
    (0, logger_1.logDebug)('Cleared accounts cache', { userId });
}
/**
 * 清空用户的交易缓存
 */
async function clearTransactionsCache(userId) {
    const prismaAny = prisma_1.prisma;
    await prismaAny.plaidTransactionCache.deleteMany({ where: { userId } });
    await prismaAny.plaidSyncLog.update({
        where: { userId },
        data: { transactionsSyncedAt: null, totalTransactions: 0 },
    });
    (0, logger_1.logDebug)('Cleared transactions cache', { userId });
}
/**
 * 清空用户的投资缓存
 */
async function clearInvestmentsCache(userId) {
    const prismaAny = prisma_1.prisma;
    await Promise.all([
        prismaAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
        prismaAny.plaidInvestmentCache.deleteMany({ where: { userId } }),
    ]);
    await prismaAny.plaidSyncLog.update({
        where: { userId },
        data: { investmentsSyncedAt: null, totalInvestments: 0 },
    });
    (0, logger_1.logDebug)('Cleared investments cache', { userId });
}
/**
 * 更新同步时间戳
 */
async function updateSyncTimestamp(userId, type, stats) {
    const prismaAny = prisma_1.prisma;
    const updateData = {};
    switch (type) {
        case 'accounts':
            updateData.accountsSyncedAt = new Date();
            if (stats?.total !== undefined) {
                updateData.totalAccounts = stats.total;
            }
            break;
        case 'transactions':
            updateData.transactionsSyncedAt = new Date();
            if (stats?.total !== undefined) {
                updateData.totalTransactions = stats.total;
            }
            break;
        case 'investments':
            updateData.investmentsSyncedAt = new Date();
            if (stats?.total !== undefined) {
                updateData.totalInvestments = stats.total;
            }
            break;
    }
    await prismaAny.plaidSyncLog.update({
        where: { userId },
        data: updateData,
    });
    (0, logger_1.logDebug)('Updated sync timestamp', { userId, type, ...stats });
}
/**
 * 批量插入或更新账户缓存
 */
async function upsertAccountsCache(userId, accounts) {
    const prismaAny = prisma_1.prisma;
    // 先删除旧缓存
    await prismaAny.plaidAccountCache.deleteMany({ where: { userId } });
    // 批量插入新缓存
    if (accounts.length === 0) {
        return 0;
    }
    await prismaAny.plaidAccountCache.createMany({
        data: accounts.map((account) => ({
            userId,
            ...account,
        })),
    });
    return accounts.length;
}
/**
 * 批量插入或更新交易缓存
 */
async function upsertTransactionsCache(userId, transactions, removedTransactionIds = []) {
    const prismaAny = prisma_1.prisma;
    if (transactions.length === 0 && removedTransactionIds.length === 0) {
        return 0;
    }
    if (removedTransactionIds.length > 0) {
        await prismaAny.plaidTransactionCache.deleteMany({
            where: {
                userId,
                transactionId: { in: removedTransactionIds },
            },
        });
    }
    // 对于交易，我们不删除旧的，而是按月份删除，然后插入
    const months = new Set(transactions.map((t) => t.month));
    for (const month of months) {
        await prismaAny.plaidTransactionCache.deleteMany({
            where: { userId, month },
        });
    }
    if (transactions.length === 0) {
        return 0;
    }
    await prismaAny.plaidTransactionCache.createMany({
        data: transactions.map((tx) => ({
            userId,
            ...tx,
        })),
    });
    return transactions.length;
}
/**
 * 批量插入或更新投资账户缓存
 */
async function upsertInvestmentAccountsCache(userId, investmentAccounts) {
    const prismaAny = prisma_1.prisma;
    // 删除旧缓存
    await prismaAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } });
    if (investmentAccounts.length === 0) {
        return 0;
    }
    await prismaAny.plaidInvestmentAccountCache.createMany({
        data: investmentAccounts.map((account) => ({
            userId,
            ...account,
        })),
    });
    return investmentAccounts.length;
}
/**
 * 批量插入或更新投资持仓缓存
 */
async function upsertInvestmentsCache(userId, investments) {
    const prismaAny = prisma_1.prisma;
    // 删除旧缓存
    await prismaAny.plaidInvestmentCache.deleteMany({ where: { userId } });
    if (investments.length === 0) {
        return 0;
    }
    await prismaAny.plaidInvestmentCache.createMany({
        data: investments.map((inv) => ({
            userId,
            ...inv,
        })),
    });
    return investments.length;
}
/**
 * 从缓存获取账户数据
 */
async function getAccountsFromCache(userId) {
    const prismaAny = prisma_1.prisma;
    return await prismaAny.plaidAccountCache.findMany({
        where: { userId },
        orderBy: { cachedAt: 'desc' },
    });
}
/**
 * 从缓存获取交易数据（某个月份）
 */
async function getTransactionsFromCache(userId, month) {
    const prismaAny = prisma_1.prisma;
    const where = { userId };
    if (month) {
        where.month = month;
    }
    return await prismaAny.plaidTransactionCache.findMany({
        where,
        orderBy: { date: 'desc' },
    });
}
/**
 * 从缓存获取投资账户数据
 */
async function getInvestmentAccountsFromCache(userId) {
    const prismaAny = prisma_1.prisma;
    return await prismaAny.plaidInvestmentAccountCache.findMany({
        where: { userId },
        orderBy: { cachedAt: 'desc' },
    });
}
/**
 * 从缓存获取投资持仓数据
 */
async function getInvestmentsFromCache(userId) {
    const prismaAny = prisma_1.prisma;
    return await prismaAny.plaidInvestmentCache.findMany({
        where: { userId },
        orderBy: { cachedAt: 'desc' },
    });
}
/**
 * 获取用户的缓存统计信息
 */
async function getCacheStats(userId) {
    const prismaAny = prisma_1.prisma;
    const syncLog = await getOrCreateSyncLog(userId);
    const [accountCount, transactionCount, investmentAccountCount, investmentCount] = await Promise.all([
        prismaAny.plaidAccountCache.count({ where: { userId } }),
        prismaAny.plaidTransactionCache.count({ where: { userId } }),
        prismaAny.plaidInvestmentAccountCache.count({ where: { userId } }),
        prismaAny.plaidInvestmentCache.count({ where: { userId } }),
    ]);
    return {
        accounts: accountCount,
        transactions: transactionCount,
        investmentAccounts: investmentAccountCount,
        investments: investmentCount,
        lastSynced: syncLog.lastSyncedAt,
        accountsSynced: syncLog.accountsSyncedAt,
        transactionsSynced: syncLog.transactionsSyncedAt,
        investmentsSynced: syncLog.investmentsSyncedAt,
    };
}
//# sourceMappingURL=plaidCacheUtil.js.map