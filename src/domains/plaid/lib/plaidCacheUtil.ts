/**
 * Plaid cache utilities — TTL checks, clear, upsert encrypted rows, stats.
 */
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
 * Whether the cache is expired and needs a refresh.
 * @param lastSyncedAt last sync time (may be null)
 * @param cacheTtlSeconds cache TTL in seconds
 * @returns true if expired / missing and should refresh
 */
export function isCacheExpired(lastSyncedAt: Date | null, cacheTtlSeconds: number): boolean {
  if (!lastSyncedAt) {
    return true; // No prior cache — treat as expired
  }

  const now = new Date();
  const elapsedSeconds = (now.getTime() - lastSyncedAt.getTime()) / 1000;

  return elapsedSeconds > cacheTtlSeconds;
}

/** Get or create the user's Plaid sync log row. */
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

/** Whether accounts cache needs a refresh. */
export async function shouldRefreshAccountsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.accountsSyncedAt, syncLog.accountsCacheTtl);
}

/** Whether transactions cache needs a refresh. */
export async function shouldRefreshTransactionsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.transactionsSyncedAt, syncLog.transactionsCacheTtl);
}

/** Whether investments cache needs a refresh. */
export async function shouldRefreshInvestmentsCache(userId: string): Promise<boolean> {
  const syncLog = await getOrCreateSyncLog(userId);
  return isCacheExpired(syncLog.investmentsSyncedAt, syncLog.investmentsCacheTtl);
}

/** Clear all Plaid caches for the user (manual refresh). */
export async function clearAllPlaidCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await Promise.all([
    prismaAny.plaidAccountCache.deleteMany({ where: { userId } }),
    prismaAny.plaidTransactionCache.deleteMany({ where: { userId } }),
    prismaAny.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
    prismaAny.plaidInvestmentCache.deleteMany({ where: { userId } }),
  ]);

  // Reset sync timestamps
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

/** Clear accounts cache for the user. */
export async function clearAccountsCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await prismaAny.plaidAccountCache.deleteMany({ where: { userId } });

  await prismaAny.plaidSyncLog.update({
    where: { userId },
    data: { accountsSyncedAt: null, totalAccounts: 0 },
  });

  logDebug('Cleared accounts cache', { userId });
}

/** Clear transactions cache for the user. */
export async function clearTransactionsCache(userId: string): Promise<void> {
  const prismaAny = prisma as any;

  await prismaAny.plaidTransactionCache.deleteMany({ where: { userId } });

  await prismaAny.plaidSyncLog.update({
    where: { userId },
    data: { transactionsSyncedAt: null, totalTransactions: 0 },
  });

  logDebug('Cleared transactions cache', { userId });
}

/** Clear investments cache for the user. */
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

/** Update sync timestamps (and optional totals) for a cache type. */
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
// Phase 3 Zero-Access E2EE writes: each row is metadata + encrypted payload
// ────────────────────────────────────────────────────────────────────

/**
 * Batch-sync account cache (snapshot mode: delete then insert).
 * Plaid accounts API always returns the full list — keep replace-all semantics.
 */
export async function upsertAccountsCache(
  userId: string,
  accounts: Array<{
    plaidItemId: string | null;
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
 * Batch-sync transaction cache (incremental upsert by transactionId).
 *
 * Unlike pre-PR-5 by-month delete+insert:
 *   - transactionsSync is incremental (added / modified / removed only)
 *   - removedTransactionIds are deleted by the caller (in fetchPlaintextFromPlaid)
 *   - unchanged rows must stay (ciphertext still protected by the old SEK)
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

/** Batch-sync investment account cache (snapshot: delete then insert). */
export async function upsertInvestmentAccountsCache(
  userId: string,
  investmentAccounts: Array<{
    plaidItemId: string | null;
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

/** Batch-sync investment holdings cache (snapshot: delete then insert). */
export async function upsertInvestmentsCache(
  userId: string,
  investments: Array<{
    plaidItemId: string | null;
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

/** Cache row counts and sync timestamps for a user. */
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
