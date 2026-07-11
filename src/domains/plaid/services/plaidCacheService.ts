/**
 * Plaid 快取服務
 * 協調快取、同步與財務快照相關操作
 */

import { Prisma } from '@prisma/client';
import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import {
  shouldRefreshAccountsCache,
  shouldRefreshTransactionsCache,
  shouldRefreshInvestmentsCache,
  upsertAccountsCache,
  upsertTransactionsCache,
  upsertInvestmentAccountsCache,
  upsertInvestmentsCache,
  updateSyncTimestamp,
  getOrCreateSyncLog,
} from '../lib/plaidCacheUtil';
import {
  checkApiLimit,
  recordApiOperation,
  getApiLimitForTier,
  getUserTier,
} from '../../shared/lib/apiRateLimitUtil';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import {
  PlaidAccountPayload,
  PlaidTransactionPayload,
  PlaidInvestmentAccountPayload,
  PlaidInvestmentPayload,
  FinanceSnapshot,
} from '../models/types';

import { PlaidAccountService } from './plaidAccountService';
import { PlaidTransactionService } from './plaidTransactionService';
import { PlaidInvestmentService } from './plaidInvestmentService';
import { PlaidAuthService } from './plaidAuthService';
import { AssetService } from '../../asset/services/assetService';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
  PayloadKeyHandle,
} from '../../shared/services/payloadKeyService';
import {
  splitAccount,
  splitTransaction,
  splitInvestmentAccount,
  splitInvestment,
} from '../lib/plaidPayloadBuilder';

/**
 * Phase 3 Zero-Access E2EE 加密形式快照
 *
 * 後端只回傳 metadata + ciphertext，前端用 privateKey unwrap payloadKeys 後解密 row payload。
 */
export interface EncryptedFinanceSnapshot {
  payloadKeys: Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>;
  accounts: Array<{
    accountId: string;
    plaidItemId: string | null;
    type: string;
    bucket: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
  transactions: Array<{
    transactionId: string;
    accountId: string;
    plaidItemId: string | null;
    date: string;
    month: string;
    isPending: boolean;
    isRecurring: boolean;
    isSubscription: boolean;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
  investmentAccounts: Array<{
    accountId: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
  investments: Array<{
    investmentId: string;
    accountId: string;
    type: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;

  /**
   * Phase 3 partial-failure surface.
   *
   * When `partial` is `true`, at least one Plaid Item failed to refresh in
   * this request and `failedItemIds` lists the affected `PlaidItem.id`
   * values. The encrypted rows for the failing item(s) reflect their last
   * known state (or are absent if the item has never synced), so callers
   * MUST treat the snapshot as incomplete and decide whether to retry, hide
   * stale items, or surface a warning to the user.
   *
   * When `partial` is `false`, all items succeeded (or there were no items).
   */
  partial: boolean;
  failedItemIds: string[];
}

// 後端 sync 時暫態持有的明文 plaintext（API → SEK 加密 → DB）
type PlaintextFinanceSnapshot = FinanceSnapshot;

interface FetchPlaintextResult {
  snapshot: PlaintextFinanceSnapshot;
  failedItemIds: string[];
  /**
   * Pending `PlaidItem.transactionsCursor` advances from this fetch.
   *
   * We collect cursors here instead of writing them inline during fetch so
   * the cursor can be committed in the **same DB transaction** as the cache
   * write. Otherwise a fetch that succeeds but a save that fails (e.g.
   * transaction timeout on a large first sync) would permanently advance
   * the cursor past data that never made it into the cache.
   */
  pendingCursorUpdates: Array<{ plaidItemId: string; nextCursor: string }>;
}

export class PlaidCacheService {
  /**
   * 取得「加密形式」財務快照（優化版－支持快取）。
   *
   * Phase 3 Zero-Access E2EE only：
   *   - 快取未過期 → 直接從 cache 撈加密 row（後端不解密）
   *   - 快取過期或 isManualRefresh → 從 Plaid API 抓明文 → 加密寫 cache → 從 cache 撈加密 row 回傳
   *
   * 後端在第二條路徑中**只在記憶體**短暫持有明文，立即 SEK 加密寫 DB 後 zeroize SEK。
   */
  static async getFinanceSnapshotOptimized(
    userId: string,
    isManualRefresh: boolean = false,
  ): Promise<EncryptedFinanceSnapshot> {
    const cacheStartTime = Date.now();

    // 只有手動刷新才檢查限制，自動刷新不受限制
    if (isManualRefresh) {
      const refreshCheck = await checkApiLimit(userId, 'plaid_refresh');

      if (!refreshCheck.canOperate) {
        const tier = await getUserTier(userId);
        const refreshLimit = getApiLimitForTier('plaid_refresh', tier);
        const error = new Error(`Daily refresh limit reached. ${tier} users can refresh ${refreshLimit} times per day. ${refreshCheck.message}`);
        (error as any).statusCode = 429;
        (error as any).refreshLimit = refreshLimit;
        (error as any).refreshCountRemaining = 0;
        throw error;
      }

      logDebug('User has refresh quota available', {
        userId,
        refreshCountRemaining: refreshCheck.operationCountRemaining,
        refreshLimit: refreshCheck.operationLimit,
      });
    }

    const forceRefresh = isManualRefresh;

    // 檢查快取狀態
    const shouldRefreshAccounts = forceRefresh || (await shouldRefreshAccountsCache(userId));
    const shouldRefreshTransactions = forceRefresh || (await shouldRefreshTransactionsCache(userId));
    const shouldRefreshInvestments = forceRefresh || (await shouldRefreshInvestmentsCache(userId));

    logDebug('Cache status check', {
      userId,
      forceRefresh,
      shouldRefreshAccounts,
      shouldRefreshTransactions,
      shouldRefreshInvestments,
    });

    if (!forceRefresh && !shouldRefreshAccounts && !shouldRefreshTransactions && !shouldRefreshInvestments) {
      logDebug('Using cached encrypted snapshot', { userId });
      return this.getEncryptedSnapshotFromCache(userId);
    }

    // 從 Plaid API 取得明文 → 加密寫 cache
    logDebug('Fetching fresh data from Plaid API', { userId, forceRefresh });

    let fetchResult: FetchPlaintextResult;
    try {
      fetchResult = await this.fetchPlaintextFromPlaid(userId);
      await this.saveFinanceSnapshotToCache(
        userId,
        fetchResult.snapshot,
        fetchResult.pendingCursorUpdates,
      );
    } catch (error) {
      if (error instanceof KeyPairNotConfiguredError) {
        // User hasn't called POST /api/auth/keys/setup yet.
        // Serve stale cached rows rather than failing outright; if there is
        // nothing in the cache either, re-throw so the controller can return
        // a 409 KEY_PAIR_REQUIRED response.
        appLogger.warn(
          'KeyPair not configured — serving stale cache if available',
          { userId },
        );
        const stale = await this.getEncryptedSnapshotFromCache(userId);
        if (stale.payloadKeys.length > 0) {
          return stale;
        }
        throw error;
      }
      throw error;
    }

    if (isManualRefresh) {
      try {
        await recordApiOperation(userId, 'plaid_refresh');
        logDebug('Recorded manual refresh', { userId });
      } catch (error) {
        appLogger.warn('Failed to record refresh', { userId, error });
      }
    }

    const apiDuration = Date.now() - cacheStartTime;
    logPerformance('get_finance_snapshot_api', apiDuration, 5000);
    logBusinessEvent('finance_snapshot_fetched_from_api', userId, {
      source: 'api',
      isManualRefresh,
      accountDelta: fetchResult.snapshot.accounts.length,
      transactionDelta: fetchResult.snapshot.transactions.length,
      investmentAccountDelta: fetchResult.snapshot.investmentAccounts.length,
      investmentDelta: fetchResult.snapshot.investments.length,
      failedItemCount: fetchResult.failedItemIds.length,
    });

    // 加密寫入完成後，從 cache 撈出最新加密 snapshot；附上本輪失敗的 item ids，
    // 讓 controller / 前端可以區分「真的全成功」與「部分 item 失敗、其餘照舊」。
    const encrypted = await this.getEncryptedSnapshotFromCache(userId);
    return {
      ...encrypted,
      partial: fetchResult.failedItemIds.length > 0,
      failedItemIds: fetchResult.failedItemIds,
    };
  }

  /**
   * 從緩存取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
   *
   * 與 `getSnapshotFromCache` 不同：
   *   - 後端不解密任何 payload，只 select metadata + payloadCiphertext + payloadKeyId
   *   - 額外回傳 payloadKeys（去重後的 wrappedSek 清單）
   *
   * 前端流程：
   *   1. 用 privateKey 對每個 payloadKey 做 sealed-box-open → 拿到 SEK
   *   2. 對每個 row 用對應 SEK 解 payloadCiphertext → 拿到 sensitive payload
   *   3. 與 metadata 合併 → 渲染
   *
   * 沒有 payloadCiphertext 的 row（PR 2 之前未 setup keypair 時寫入的）會被跳過。
   */
  static async getEncryptedSnapshotFromCache(userId: string): Promise<EncryptedFinanceSnapshot> {
    const cacheStartTime = Date.now();

    const [accountRows, transactionRows, investmentAccountRows, investmentRows] = await Promise.all([
      prisma.plaidAccountCache.findMany({
        where: {
          userId,
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          accountId: true,
          plaidItemId: true,
          type: true,
          bucket: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { cachedAt: 'desc' },
      }),
      prisma.plaidTransactionCache.findMany({
        where: {
          userId,
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          transactionId: true,
          accountId: true,
          plaidItemId: true,
          date: true,
          month: true,
          isPending: true,
          isRecurring: true,
          isSubscription: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { date: 'desc' },
      }),
      prisma.plaidInvestmentAccountCache.findMany({
        where: {
          userId,
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          accountId: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { cachedAt: 'desc' },
      }),
      prisma.plaidInvestmentCache.findMany({
        where: {
          userId,
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          investmentId: true,
          accountId: true,
          type: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { cachedAt: 'desc' },
      }),
    ]);

    const accounts = accountRows.map((r: any) => ({
      accountId: r.accountId,
      plaidItemId: r.plaidItemId,
      type: r.type,
      bucket: r.bucket,
      cachedAt: r.cachedAt,
      payloadCiphertext: r.payloadCiphertext as string,
      payloadKeyId: r.payloadKeyId as string,
    }));
    const transactions = transactionRows.map((r: any) => ({
      transactionId: r.transactionId,
      accountId: r.accountId,
      plaidItemId: r.plaidItemId ?? null,
      date: r.date,
      month: r.month,
      isPending: r.isPending,
      isRecurring: r.isRecurring,
      isSubscription: r.isSubscription,
      cachedAt: r.cachedAt,
      payloadCiphertext: r.payloadCiphertext as string,
      payloadKeyId: r.payloadKeyId as string,
    }));
    const investmentAccounts = investmentAccountRows.map((r: any) => ({
      accountId: r.accountId,
      cachedAt: r.cachedAt,
      payloadCiphertext: r.payloadCiphertext as string,
      payloadKeyId: r.payloadKeyId as string,
    }));
    const investments = investmentRows.map((r: any) => ({
      investmentId: r.investmentId,
      accountId: r.accountId,
      type: r.type,
      cachedAt: r.cachedAt,
      payloadCiphertext: r.payloadCiphertext as string,
      payloadKeyId: r.payloadKeyId as string,
    }));

    const payloadKeyIds = Array.from(
      new Set<string>([
        ...accounts.map((a: { payloadKeyId: string }) => a.payloadKeyId),
        ...transactions.map((t: { payloadKeyId: string }) => t.payloadKeyId),
        ...investmentAccounts.map((a: { payloadKeyId: string }) => a.payloadKeyId),
        ...investments.map((i: { payloadKeyId: string }) => i.payloadKeyId),
      ]),
    );
    const payloadKeys = await PayloadKeyService.getForRead(userId, payloadKeyIds);

    const duration = Date.now() - cacheStartTime;
    logPerformance('get_encrypted_finance_snapshot', duration, 200);

    logBusinessEvent('finance_snapshot_fetched_encrypted', userId, {
      source: 'cache_encrypted',
      accountCount: accounts.length,
      transactionCount: transactions.length,
      investmentAccountCount: investmentAccounts.length,
      investmentCount: investments.length,
      payloadKeyCount: payloadKeys.length,
    });

    return {
      payloadKeys,
      accounts,
      transactions,
      investmentAccounts,
      investments,
      // Cache-only reads have no in-flight fetch failures to report. Callers
      // that want to surface partial-state info must set these explicitly
      // (e.g. `getFinanceSnapshotOptimized` after a refresh attempt).
      partial: false,
      failedItemIds: [],
    };
  }

  /**
   * 從 Plaid API 取得明文增量快照（內部用）。
   *
   * 此回傳值僅在 `saveFinanceSnapshotToCache` 內被加密寫入 DB；caller 不應外洩到 controller。
   * transactionsSync 為增量 API，回傳是「上次 cursor 之後新增/修改的 transactions」。
   * 既有 transactions 保留在 DB 加密表內，**不在此回傳值中**——caller 不需要 merge。
   *
   * `failedItemIds` records `PlaidItem.id` values whose per-item fetch threw.
   * Callers can surface this so the front-end knows the snapshot is partial.
   */
  private static async fetchPlaintextFromPlaid(userId: string): Promise<FetchPlaintextResult> {
    const startTime = Date.now();

    logDebug('Fetching finance snapshot', { userId });

    const userPlaidClient = createPlaidClientForUser(userId);

    const prismaAny = prisma as any;

    const plaidItems = await prismaAny.plaidItem.findMany({
      where: { userId },
      select: {
        id: true,
        itemId: true,
        accessToken: true,
        transactionsCursor: true,
        institutionName: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (plaidItems.length === 0) {
      logDebug('No Plaid items found for user', { userId });
      return {
        snapshot: {
          accounts: [],
          transactions: [],
          investmentAccounts: [],
          investments: [],
        },
        failedItemIds: [],
        pendingCursorUpdates: [],
      };
    }

    const accounts: PlaidAccountPayload[] = [];
    const transactions: PlaidTransactionPayload[] = [];
    const removedTransactionIds = new Set<string>();
    const investmentAccounts: PlaidInvestmentAccountPayload[] = [];
    const investments: PlaidInvestmentPayload[] = [];
    const failedItemIds: string[] = [];
    const pendingCursorUpdates: Array<{ plaidItemId: string; nextCursor: string }> = [];

    // 並行處理每個 Plaid 項目（Item）
    for (const item of plaidItems) {
      try {
        const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem({ accessToken: item.accessToken, itemId: item.itemId });

        // 並行獲取帳戶、交易、投資數據
        const [accountData, transactionData, investmentData] = await Promise.all([
          PlaidAccountService.fetchAccountsWithAPY(userPlaidClient, item, decryptedAccessToken),
          PlaidTransactionService.fetchTransactions(
            userPlaidClient,
            decryptedAccessToken,
            item.transactionsCursor ?? undefined
          ),
          PlaidInvestmentService.fetchInvestmentHoldings(userPlaidClient, item, decryptedAccessToken),
        ]);

        // Tag每筆 account / transaction 的來源 Plaid Item，讓加密 cache row 能寫入
        // 正確的 plaidItemId（供前端把 account 與 item join；避免空字串 fallback）。
        accounts.push(...accountData.bankingAccounts.map((a) => ({ ...a, plaidItemId: item.id })));
        transactions.push(...transactionData.transactions.map((t) => ({ ...t, plaidItemId: item.id })));
        transactionData.removedTransactionIds.forEach((id) => removedTransactionIds.add(id));
        investments.push(...investmentData.investments.map((inv) => ({ ...inv, plaidItemId: item.id })));

        // Push investmentAccounts: holdings-API entries first, accountsGet entries last.
        // The dedup Map keeps the *last* value for each id, so accountsGet data
        // (which carries the correct institution logo) wins over the entry built
        // inside fetchInvestmentHoldings. This also handles the edge case where
        // an account appears in investmentsHoldingsGet but not in accountsGet —
        // it will still be present from the first push.
        investmentAccounts.push(...investmentData.investmentAccounts.map((a) => ({ ...a, plaidItemId: item.id })));
        investmentAccounts.push(...accountData.investmentAccounts.map((a) => ({ ...a, plaidItemId: item.id })));

        // Buffer the cursor advance instead of writing it now: it is only
        // safe to advance the cursor once the corresponding transaction
        // rows have been persisted, so the actual write happens inside the
        // same `prisma.$transaction` as `saveFinanceSnapshotToCache`.
        if (transactionData.nextCursor) {
          pendingCursorUpdates.push({
            plaidItemId: item.id,
            nextCursor: transactionData.nextCursor,
          });
        }
      } catch (error: any) {
        // One Plaid Item failing must not silently degrade the snapshot —
        // track the failure so callers can flag the response as partial and
        // the client can decide whether to retry or surface a warning.
        failedItemIds.push(item.id);
        appLogger.warn('Failed to fetch data for Plaid item', {
          error: error.response?.data || error.message || error,
          plaidItemId: item.id,
          userId,
        });
      }
    }

    // 處理已刪除的交易 — 直接從加密 cache 移除（不依賴明文欄位）
    if (removedTransactionIds.size > 0) {
      try {
        await prisma.plaidTransactionCache.deleteMany({
          where: {
            userId,
            transactionId: { in: Array.from(removedTransactionIds) },
          },
        });
      } catch (err) {
        appLogger.warn('Failed to delete removed transactions', { userId, err });
      }
    }

    // 去重（同一 user 跨 item 不會有同 id，但保險起見）
    const dedupedAccounts = Array.from(new Map(accounts.map((acc) => [acc.id, acc])).values());
    const dedupedInvestmentAccounts = Array.from(new Map(investmentAccounts.map((acc) => [acc.id, acc])).values());
    const dedupedInvestments = Array.from(new Map(investments.map((inv) => [inv.id, inv])).values());
    const dedupedTransactions = Array.from(new Map(transactions.map((tx) => [tx.id, tx])).values());

    const duration = Date.now() - startTime;
    logPerformance('get_finance_snapshot', duration, 5000);
    logBusinessEvent('finance_snapshot_fetched', userId, {
      accountCount: dedupedAccounts.length,
      transactionDeltaCount: dedupedTransactions.length,
      removedTransactionCount: removedTransactionIds.size,
      investmentAccountCount: dedupedInvestmentAccounts.length,
      investmentCount: dedupedInvestments.length,
      failedItemCount: failedItemIds.length,
    });

    AuditLogger.logPlaidOperation(
      'FETCH_SNAPSHOT',
      userId,
      'SUCCESS',
      undefined,
      {
        accountCount: dedupedAccounts.length,
        transactionDeltaCount: dedupedTransactions.length,
        removedTransactionCount: removedTransactionIds.size,
        investmentAccountCount: dedupedInvestmentAccounts.length,
        investmentCount: dedupedInvestments.length,
        // failedItemIds is empty on full success; populated means partial
        // fetch — keep it inside details so the audit-log status stays a
        // simple SUCCESS/FAILURE binary.
        failedItemIds,
        partial: failedItemIds.length > 0,
      },
      undefined,
      duration,
    );

    return {
      snapshot: {
        accounts: dedupedAccounts,
        transactions: dedupedTransactions,
        investmentAccounts: dedupedInvestmentAccounts,
        investments: dedupedInvestments,
      },
      failedItemIds,
      pendingCursorUpdates,
    };
  }

  /**
   * 將明文財務快照加密寫入快取（Phase 3 Zero-Access E2EE only）。
   *
   * 流程：
   *   1. 必須能取得使用者的 publicKey；否則拋 KeyPairNotConfiguredError
   *      （PR 5 已移除 legacy 寫入路徑，使用者必須先 setup keypair）
   *   2. 為這次 sync 建立 4 把 SEK（accounts / transactions / investmentAccounts / investments）
   *   3. 每個 row 把 sensitive 欄位整包 AES-256-GCM 加密成 payloadCiphertext
   *   4. 同步寫 cashFlow + plaidInvestment 加密 AssetSnapshot（趁明文還在記憶體）
   *   5. finally 立即 zeroize 所有 SEK
   */
  private static async saveFinanceSnapshotToCache(
    userId: string,
    snapshot: PlaintextFinanceSnapshot,
    pendingCursorUpdates: Array<{ plaidItemId: string; nextCursor: string }> = [],
  ): Promise<void> {
    const sekHandles: PayloadKeyHandle[] = [];
    const ts = Date.now();

    try {
      // Atomically: create the four payload-key rows + replace the per-row
      // cache contents + bump sync timestamps + advance Plaid cursors.
      // If any step fails the whole transaction rolls back, so we never
      // leave the DB with half-updated caches pointing at half-deleted
      // payload keys, and Plaid cursors never advance past data we failed
      // to persist (which would otherwise create a permanent gap).
      //
      // `recordSnapshotFromPlaintext` for asset history is intentionally
      // OUTSIDE this transaction — it writes to an independent table and is
      // best-effort; a failure there shouldn't roll back the finance cache.
      //
      // Timeout: the default 5 s is not enough for a first sync that may
      // upsert thousands of transactions sequentially (see
      // `upsertTransactionsCache`). 60 s is comfortably above observed
      // upper bound for ~5 k transactions.
      await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
        await getOrCreateSyncLog(userId, tx);

        // 快取表的 plaidItemId 已是 FK（onDelete: Cascade）。snapshot 是在交易外
        // 從 Plaid 抓的，若使用者在「抓取 → 寫入」之間斷線（disconnect / ITEM_REMOVE
        // webhook / token rotation 等），對應的 PlaidItem 已被刪除，此時若仍以該
        // plaidItemId 寫入會觸發外鍵違反並讓整個 sync 失敗。
        // 故在交易內重新讀取仍存在的 Item，過濾掉指向已刪除 Item 的 row（plaidItemId
        // 為 null 的 row 仍保留，FK 允許 null）。已刪除 Item 的舊 cache 已由 cascade 清除，
        // 此處丟棄其新資料即為正確語意。
        const liveItems = await tx.plaidItem.findMany({ where: { userId }, select: { id: true } });
        const validItemIds = new Set(liveItems.map((i) => i.id));
        const hasValidItemRef = (pid: string | null | undefined): boolean => pid == null || validItemIds.has(pid);

        const accountsForCache = snapshot.accounts.filter((a) => hasValidItemRef(a.plaidItemId));
        const transactionsForCache = snapshot.transactions.filter((t) => hasValidItemRef(t.plaidItemId));
        const investmentAccountsForCache = snapshot.investmentAccounts.filter((a) => hasValidItemRef(a.plaidItemId));
        const investmentsForCache = snapshot.investments.filter((i) => hasValidItemRef(i.plaidItemId));
        const cursorUpdatesForValidItems = pendingCursorUpdates.filter((u) => validItemIds.has(u.plaidItemId));

        const droppedCount =
          (snapshot.accounts.length - accountsForCache.length) +
          (snapshot.transactions.length - transactionsForCache.length) +
          (snapshot.investmentAccounts.length - investmentAccountsForCache.length) +
          (snapshot.investments.length - investmentsForCache.length);
        if (droppedCount > 0) {
          appLogger.warn('Dropped Plaid cache rows referencing removed items during sync', {
            userId,
            droppedCount,
          });
        }

        let accountsKey: PayloadKeyHandle;
        let transactionsKey: PayloadKeyHandle;
        let investmentAccountsKey: PayloadKeyHandle;
        let investmentsKey: PayloadKeyHandle;

        try {
          const keys = await PayloadKeyService.createForUserScopes(
            userId,
            [
              `plaid_acct:${userId}:${ts}`,
              `plaid_tx:${userId}:${ts}`,
              `plaid_inv_acct:${userId}:${ts}`,
              `plaid_inv:${userId}:${ts}`,
            ],
            tx,
          );
          accountsKey           = keys.get(`plaid_acct:${userId}:${ts}`)!;
          transactionsKey       = keys.get(`plaid_tx:${userId}:${ts}`)!;
          investmentAccountsKey = keys.get(`plaid_inv_acct:${userId}:${ts}`)!;
          investmentsKey        = keys.get(`plaid_inv:${userId}:${ts}`)!;
          sekHandles.push(accountsKey, transactionsKey, investmentAccountsKey, investmentsKey);
        } catch (error) {
          if (error instanceof KeyPairNotConfiguredError) {
            appLogger.warn(
              'User has no E2EE key pair — Plaid sync skipped. ' +
              'Client must POST /api/auth/keys/setup before syncing.',
              { userId },
            );
          } else {
            logError('Failed to create E2EE payload keys for Plaid sync', error, { userId });
          }
          throw error;
        }

        // ── 1. 帳戶 ──
        if (accountsForCache.length > 0) {
          const accountsToCache = accountsForCache.map((acc) => {
            const split = splitAccount(acc, acc.plaidItemId ?? null, 'banking');
            return {
              plaidItemId: split.metadata.plaidItemId ?? null,
              accountId: split.metadata.accountId,
              type: split.metadata.type,
              bucket: split.metadata.bucket,
              payloadCiphertext: encryptPayload(accountsKey.sek, split.sensitive),
              payloadKeyId: accountsKey.payloadKeyId,
            };
          });

          await upsertAccountsCache(userId, accountsToCache, tx);
          await updateSyncTimestamp(userId, 'accounts', { total: accountsToCache.length }, tx);
        }

        // ── 2. 交易 ──
        if (transactionsForCache.length > 0) {
          const transactionsToCache = transactionsForCache.map((tx2) => {
            const split = splitTransaction(tx2, tx2.plaidItemId ?? null);
            return {
              accountId: split.metadata.accountId,
              transactionId: split.metadata.transactionId,
              plaidItemId: split.metadata.plaidItemId ?? null,
              date: split.metadata.date,
              month: split.metadata.month,
              isPending: split.metadata.isPending,
              isRecurring: split.metadata.isRecurring,
              isSubscription: split.metadata.isSubscription,
              payloadCiphertext: encryptPayload(transactionsKey.sek, split.sensitive),
              payloadKeyId: transactionsKey.payloadKeyId,
            };
          });

          await upsertTransactionsCache(userId, transactionsToCache, tx);
          await updateSyncTimestamp(userId, 'transactions', { total: transactionsToCache.length }, tx);
        }

        // ── 3. 投資帳戶 ──
        if (investmentAccountsForCache.length > 0) {
          const investmentAccountsToCache = investmentAccountsForCache.map((acc) => {
            const split = splitInvestmentAccount(acc, acc.plaidItemId ?? null);
            return {
              plaidItemId: split.metadata.plaidItemId,
              accountId: split.metadata.accountId,
              payloadCiphertext: encryptPayload(investmentAccountsKey.sek, split.sensitive),
              payloadKeyId: investmentAccountsKey.payloadKeyId,
            };
          });

          await upsertInvestmentAccountsCache(userId, investmentAccountsToCache, tx);
        }

        // ── 4. 投資持倉 ──
        if (investmentsForCache.length > 0) {
          const investmentsToCache = investmentsForCache.map((inv) => {
            const split = splitInvestment(inv, inv.plaidItemId ?? null);
            return {
              plaidItemId: split.metadata.plaidItemId,
              accountId: split.metadata.accountId,
              investmentId: split.metadata.investmentId,
              type: split.metadata.type,
              payloadCiphertext: encryptPayload(investmentsKey.sek, split.sensitive),
              payloadKeyId: investmentsKey.payloadKeyId,
            };
          });

          await upsertInvestmentsCache(userId, investmentsToCache, tx);
          await updateSyncTimestamp(userId, 'investments', { total: investmentsToCache.length }, tx);
        }

        // ── 5. Advance Plaid transaction cursors (only after writes succeed) ──
        // Done last so a failure in any of the cache writes above rolls back
        // the cursor advance too, avoiding permanent gaps in transactionsSync.
        const txAny = tx as unknown as { plaidItem: { update: (args: { where: { id: string }; data: { transactionsCursor: string } }) => Promise<unknown> } };
        for (const { plaidItemId, nextCursor } of cursorUpdatesForValidItems) {
          await txAny.plaidItem.update({
            where: { id: plaidItemId },
            data: { transactionsCursor: nextCursor },
          });
        }
      },
      {
        timeout: 60_000,
        maxWait: 10_000,
      },
    );

      logDebug('Saved encrypted finance snapshot to cache', {
        userId,
        accounts: snapshot.accounts.length,
        transactions: snapshot.transactions.length,
        investmentAccounts: snapshot.investmentAccounts.length,
        investments: snapshot.investments.length,
      });

      // ── Phase 3: 在還持有明文時直接算 cashFlow + plaidInvestment 並加密寫入 ──
      // exchange / debank 的 cryptoSpot / defiProtocol 由各自的 sync 自己更新。
      // Best-effort: failures here are logged in recordSnapshotFromPlaintext;
      // a missing snapshot just means the asset-history chart misses a point
      // for this metric, not that the Plaid cache is invalid.
      try {
        const plaidMetrics = AssetService.computePlaidMetricsFromSnapshot({
          accounts: snapshot.accounts,
          investments: snapshot.investments,
        });
        await AssetService.recordSnapshotFromPlaintext(userId, plaidMetrics);
      } catch (assetError) {
        appLogger.warn('Failed to record Plaid asset snapshot (cache already saved)', {
          userId,
          error: assetError instanceof Error ? assetError.message : assetError,
        });
      }

      // ── Best-effort GC：清掉本輪 snapshot 模式換下來的孤兒 EncryptedPayloadKey ──
      // 失敗不影響已寫入的 cache；下一輪 sync 會再嘗試。
      try {
        await PayloadKeyService.deleteOrphanedKeys(userId);
      } catch (gcError) {
        appLogger.warn('Failed to GC orphaned payload keys (cache already saved)', {
          userId,
          error: gcError instanceof Error ? gcError.message : gcError,
        });
      }
    } catch (error) {
      appLogger.warn('Error saving encrypted snapshot to cache', { userId, error });
      throw error;
    } finally {
      sekHandles.forEach((handle) => zeroize(handle.sek));
    }
  }
}
