import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { logDebug } from '../../logger';

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
export function isCacheExpired(lastSyncedAt: Date | null, cacheTtlSeconds: number): boolean {
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
export async function getOrCreateSyncLog(userId: string, db: CacheUtilDb = prisma) {
  const dbAny = db as any;

  const existingLog = await dbAny.plaidSyncLog.findUnique({
    where: { userId },
  });

  if (existingLog) {
    return existingLog;
  }

  return await dbAny.plaidSyncLog.create({
    data: { userId },
  });
}

/**
 * 检查账户缓存是否需要刷新
 */
export async function shouldRefreshAccountsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.accountsSyncedAt, syncLog.accountsCacheTtl);
}

/**
 * 检查交易缓存是否需要刷新
 */
export async function shouldRefreshTransactionsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.transactionsSyncedAt, syncLog.transactionsCacheTtl);
}

/**
 * 检查投资缓存是否需要刷新
 */
export async function shouldRefreshInvestmentsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.investmentsSyncedAt, syncLog.investmentsCacheTtl);
}

/**
 * 清空用户的所有 Plaid 缓存 (用于手动刷新)
 */
export async function clearAllPlaidCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

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

  logDebug('Cleared all Plaid cache', { userId });
}

/**
 * 清空用户的账户缓存
 */
export async function clearAccountsCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await prismaAny.plaidAccountCache.deleteMany({ where: { userId } });

  await prismaAny.plaidSyncLog.update({
    where: { userId },
    data: { accountsSyncedAt: null, totalAccounts: 0 },
  });

  logDebug('Cleared accounts cache', { userId });
}

/**
 * 清空用户的交易缓存
 */
export async function clearTransactionsCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await prismaAny.plaidTransactionCache.deleteMany({ where: { userId } });

  await prismaAny.plaidSyncLog.update({
    where: { userId },
    data: { transactionsSyncedAt: null, totalTransactions: 0 },
  });

  logDebug('Cleared transactions cache', { userId });
}

/**
 * 清空用户的投资缓存
 */
export async function clearInvestmentsCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await Promise.all([
    prismaAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
    prismaAny.plaidInvestmentCache.deleteMany({ where: { userId } }),
  ]);

  await prismaAny.plaidSyncLog.update({
    where: { userId },
    data: { investmentsSyncedAt: null, totalInvestments: 0 },
  });

  logDebug('Cleared investments cache', { userId });
}

/**
 * 更新同步时间戳
 */
export async function updateSyncTimestamp(
  userId: string,
  type: 'accounts' | 'transactions' | 'investments',
  stats?: { total?: number },
  db: CacheUtilDb = prisma,
): Promise<void> {
  const dbAny = db as any;
  const updateData: any = {};

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

  await dbAny.plaidSyncLog.update({
    where: { userId },
    data: updateData,
  });

  logDebug('Updated sync timestamp', { userId, type, ...stats });
}

// ────────────────────────────────────────────────────────────────────
// Phase 3 Zero-Access E2EE 寫入專用：每筆 row 只接 metadata + encrypted payload
// ────────────────────────────────────────────────────────────────────

/**
 * 批量同步 Plaid 帳戶快取（snapshot 模式：先 delete 後 insert）。
 * Plaid accounts API 永遠回完整列表，本函式保持「整體替換」語意。
 */
export async function upsertAccountsCache(
  userId: string,
  accounts: Array<{
    plaidItemId: string;
    accountId: string;
    type: string;
    bucket: string;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>,
  db: CacheUtilDb = prisma,
): Promise<number> {
  const dbAny = db as any;

  await dbAny.plaidAccountCache.deleteMany({ where: { userId } });

  if (accounts.length === 0) {
    return 0;
  }

  await dbAny.plaidAccountCache.createMany({
    data: accounts.map((account) => ({
      userId,
      ...account,
    })),
  });

  return accounts.length;
}

/**
 * 批量同步 Plaid 交易快取（增量 upsert by transactionId）。
 *
 * 與 PR 5 之前的「by-month delete + insert」不同：
 *   - Plaid transactionsSync 為增量 API，只回 added / modified / removed
 *   - removedTransactionIds 由 caller 處理（在 fetchPlaintextFromPlaid 中直接 delete）
 *   - 既有未變更的 row 必須保留在 DB（其加密 payloadCiphertext 仍由舊 SEK 保護）
 */
export async function upsertTransactionsCache(
  userId: string,
  transactions: Array<{
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
  }>,
  db: CacheUtilDb = prisma,
): Promise<number> {
  const dbAny = db as any;

  if (transactions.length === 0) {
    return 0;
  }

  // IMPORTANT: do NOT switch this to `Promise.all`. When `db` is a
  // `Prisma.TransactionClient` (i.e. we are inside `prisma.$transaction`),
  // running upserts in parallel is a documented Prisma anti-pattern — it
  // can deadlock the single transaction connection and is the cause of the
  // "transactions never get cached" symptom. Sequential awaits also keep
  // the transaction's wall-clock cost predictable.
  for (const tx of transactions) {
    await dbAny.plaidTransactionCache.upsert({
      where: {
        userId_transactionId: {
          userId,
          transactionId: tx.transactionId,
        },
      },
      update: {
        accountId: tx.accountId,
        plaidItemId: tx.plaidItemId ?? null,
        date: tx.date,
        month: tx.month,
        isPending: tx.isPending ?? false,
        isRecurring: tx.isRecurring ?? false,
        isSubscription: tx.isSubscription ?? false,
        payloadCiphertext: tx.payloadCiphertext,
        payloadKeyId: tx.payloadKeyId,
      },
      create: {
        userId,
        accountId: tx.accountId,
        transactionId: tx.transactionId,
        plaidItemId: tx.plaidItemId ?? null,
        date: tx.date,
        month: tx.month,
        isPending: tx.isPending ?? false,
        isRecurring: tx.isRecurring ?? false,
        isSubscription: tx.isSubscription ?? false,
        payloadCiphertext: tx.payloadCiphertext,
        payloadKeyId: tx.payloadKeyId,
      },
    });
  }

  return transactions.length;
}

/**
 * 批量同步 Plaid 投資帳戶快取（snapshot 模式：先 delete 後 insert）。
 */
export async function upsertInvestmentAccountsCache(
  userId: string,
  investmentAccounts: Array<{
    accountId: string;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>,
  db: CacheUtilDb = prisma,
): Promise<number> {
  const dbAny = db as any;

  await dbAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } });

  if (investmentAccounts.length === 0) {
    return 0;
  }

  await dbAny.plaidInvestmentAccountCache.createMany({
    data: investmentAccounts.map((account) => ({
      userId,
      ...account,
    })),
  });

  return investmentAccounts.length;
}

/**
 * 批量同步 Plaid 投資持倉快取（snapshot 模式：先 delete 後 insert）。
 */
export async function upsertInvestmentsCache(
  userId: string,
  investments: Array<{
    accountId: string;
    investmentId: string;
    type: string;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>,
  db: CacheUtilDb = prisma,
): Promise<number> {
  const dbAny = db as any;

  await dbAny.plaidInvestmentCache.deleteMany({ where: { userId } });

  if (investments.length === 0) {
    return 0;
  }

  await dbAny.plaidInvestmentCache.createMany({
    data: investments.map((inv) => ({
      userId,
      ...inv,
    })),
  });

  return investments.length;
}

/**
 * 获取用户的缓存统计信息
 */
export async function getCacheStats(userId: string) {
  const prismaAny = prisma as any;
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
