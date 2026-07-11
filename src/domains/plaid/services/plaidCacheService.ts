/**
 * Plaid 快取服務
 * 協調快取、同步與財務快照相關操作
 */

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
  getAccountsFromCache,
  getTransactionsFromCache,
  getInvestmentAccountsFromCache,
  getInvestmentsFromCache,
  updateSyncTimestamp,
  getOrCreateSyncLog,
} from '../lib/plaidCacheUtil';
import {
  checkApiLimit,
  recordApiOperation,
  getApiLimitForTier,
  getUserTier,
} from '../../shared/lib/apiRateLimitUtil';
import { getStockLogoUrl } from '../../shared/lib/symbolsAndExchangesUtil';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import {
  BankingAccountType,
  TransactionType,
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
import { FieldEncryption } from '../../shared/lib/fieldEncryption';

const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=kura-finance.com&sz=128';

export class PlaidCacheService {
  /**
   * 獲取財務快照（優化版-支持緩存）
   * 優先使用緩存，必要時調用 API
   */
  static async getFinanceSnapshotOptimized(userId: string, isManualRefresh: boolean = false): Promise<FinanceSnapshot> {
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

    // 若所有快取都未過期且不是強制刷新，直接從快取取得
    if (!forceRefresh && !shouldRefreshAccounts && !shouldRefreshTransactions && !shouldRefreshInvestments) {
      logDebug('Using cached data', { userId });
      return this.getSnapshotFromCache(userId);
    }

    // 從 Plaid API 取得資料
    logDebug('Fetching fresh data from Plaid API', { userId, forceRefresh });

    const snapshot = await this.getFinanceSnapshot(userId);

    // 如果是手動刷新，記錄此次操作（計入每日限制）
    if (isManualRefresh) {
      try {
        await recordApiOperation(userId, 'plaid_refresh');
        logDebug('Recorded manual refresh', { userId });
      } catch (error) {
        appLogger.warn('Failed to record refresh', { userId, error });
      }
    }

    // 非同步保存到快取，不阻塞回應
    this.saveFinanceSnapshotToCache(userId, snapshot).catch((error) => {
      appLogger.warn('Failed to save finance snapshot to cache', {
        userId,
        error: error.message,
      });
    });

    const apiDuration = Date.now() - cacheStartTime;
    logPerformance('get_finance_snapshot_api', apiDuration, 5000);
    logBusinessEvent('finance_snapshot_fetched_from_api', userId, {
      source: 'api',
      isManualRefresh,
      accountCount: snapshot.accounts.length,
      transactionCount: snapshot.transactions.length,
      investmentAccountCount: snapshot.investmentAccounts.length,
      investmentCount: snapshot.investments.length,
    });

    return snapshot;
  }

  /**
   * 從緩存取得財務快照
   */
  private static async getSnapshotFromCache(userId: string): Promise<FinanceSnapshot> {
    const cacheStartTime = Date.now();

    const [cachedAccounts, cachedTransactions, cachedInvestmentAccounts, cachedInvestments, user] = await Promise.all([
      getAccountsFromCache(userId),
      getTransactionsFromCache(userId),
      getInvestmentAccountsFromCache(userId),
      getInvestmentsFromCache(userId),
      prisma.user.findUnique({
        where: { id: userId },
      }),
    ]);

    const accounts: PlaidAccountPayload[] = cachedAccounts.map((acc: any) => {
      const account: any = {
        id: acc.accountId,
        name: acc.name,
        balance: FieldEncryption.decryptNumber(acc.balance),
        type: acc.type as BankingAccountType,
        logo: acc.logo,
      };
      if (acc.plaidLogo) {
        account.plaidLogo = acc.plaidLogo;
      }
      const apy = FieldEncryption.decryptOptionalNumber(acc.apy);
      if (apy !== undefined) {
        account.apy = apy;
      }
      const mask = FieldEncryption.decryptOptionalString(acc.mask);
      if (mask) {
        account.mask = mask;
      }
      return account;
    });

    const accountLookup = new Map(
      accounts.map((account) => [account.id, { name: account.name, type: account.type }])
    );

    const transactions: PlaidTransactionPayload[] = cachedTransactions.map((tx: any) => {
      const accountMeta = accountLookup.get(tx.accountId);
      const transaction: any = {
        id: tx.transactionId,
        accountId: tx.accountId,
        accountName: accountMeta?.name || tx.accountId,
        accountType: accountMeta?.type || 'N/A',
        amount: tx.amount,
        date: tx.date,
        merchant: tx.merchant,
        category: tx.category,
        type: tx.type as TransactionType,
        personalFinanceCategory: tx.personalFinanceCategory,
        isRecurring: tx.isRecurring,
        recurringFrequency: tx.recurringFrequency,
        isSubscription: tx.isSubscription,
        enrichedMerchantName: tx.enrichedMerchantName,
        merchantLogo: tx.merchantLogo,
        merchantCategory: tx.merchantCategory,
        isPending: tx.isPending,
      };
      if (tx.plaidMerchantLogo) {
        transaction.plaidMerchantLogo = tx.plaidMerchantLogo;
      }
      return transaction;
    });

    const investmentAccounts: PlaidInvestmentAccountPayload[] = cachedInvestmentAccounts.map((acc: any) => {
      const invAcc: any = {
        id: acc.accountId,
        name: acc.name,
        type: 'Broker',
        logo: acc.logo,
      };
      if (acc.plaidLogo) {
        invAcc.plaidLogo = acc.plaidLogo;
      }
      return invAcc;
    });

    const investments: PlaidInvestmentPayload[] = cachedInvestments.map((inv: any) => {
      const investmentType = (inv.type as 'crypto' | 'stock') || 'stock';
      return {
        id: inv.investmentId,
        accountId: inv.accountId,
        symbol: inv.symbol,
        name: inv.name,
        holdings: FieldEncryption.decryptNumber(inv.holdings),
        currentPrice: FieldEncryption.decryptNumber(inv.currentPrice),
        change24h: inv.change24h || 0,
        type: investmentType,
        logo: getStockLogoUrl(inv.symbol),
      };
    });

    const cachedDuration = Date.now() - cacheStartTime;
    logPerformance('get_finance_snapshot_cached', cachedDuration, 100);

    logBusinessEvent('finance_snapshot_fetched_from_cache', userId, {
      source: 'cache',
      accountCount: accounts.length,
      transactionCount: transactions.length,
      investmentAccountCount: investmentAccounts.length,
      investmentCount: investments.length,
    });

    return {
      accounts,
      transactions,
      investmentAccounts,
      investments,
    };
  }

  /**
   * 取得完整財務快照（從 Plaid API）
   */
  static async getFinanceSnapshot(userId: string): Promise<FinanceSnapshot> {
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (plaidItems.length === 0) {
      logDebug('No Plaid items found for user', { userId });
      return {
        accounts: [],
        transactions: [],
        investmentAccounts: [],
        investments: [],
      };
    }

    const accounts: PlaidAccountPayload[] = [];
    const transactions: PlaidTransactionPayload[] = [];
    const investmentAccounts: PlaidInvestmentAccountPayload[] = [];
    const investments: PlaidInvestmentPayload[] = [];

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

        accounts.push(...accountData.bankingAccounts);
        investmentAccounts.push(...accountData.investmentAccounts);
        transactions.push(...transactionData.transactions);
        investmentAccounts.push(...investmentData.investmentAccounts);
        investments.push(...investmentData.investments);

        if (transactionData.nextCursor) {
          await prismaAny.plaidItem.update({
            where: { id: item.id },
            data: { transactionsCursor: transactionData.nextCursor },
          });
        }
      } catch (error: any) {
        appLogger.warn('Failed to fetch data for Plaid item', {
          error: error.response?.data || error.message || error,
          plaidItemId: item.id,
          userId,
        });
      }
    }

    // 去重並排序
    const dedupedAccounts = Array.from(new Map(accounts.map((acc) => [acc.id, acc])).values());
    const dedupedTransactions = Array.from(new Map(transactions.map((tx) => [String(tx.id), tx])).values()).sort(
      (a, b) => (a.date < b.date ? 1 : -1),
    );
    const dedupedInvestmentAccounts = Array.from(new Map(investmentAccounts.map((acc) => [acc.id, acc])).values());
    const dedupedInvestments = Array.from(new Map(investments.map((inv) => [inv.id, inv])).values());

    const duration = Date.now() - startTime;
    logPerformance('get_finance_snapshot', duration, 5000);
    logBusinessEvent('finance_snapshot_fetched', userId, {
      accountCount: dedupedAccounts.length,
      transactionCount: dedupedTransactions.length,
      investmentAccountCount: dedupedInvestmentAccounts.length,
      investmentCount: dedupedInvestments.length,
    });

    // 記錄審計日誌
    AuditLogger.logPlaidOperation('FETCH_SNAPSHOT', userId, 'SUCCESS', undefined, {
      accountCount: dedupedAccounts.length,
      transactionCount: dedupedTransactions.length,
      investmentAccountCount: dedupedInvestmentAccounts.length,
      investmentCount: dedupedInvestments.length,
    }, undefined, duration);

    return {
      accounts: dedupedAccounts,
      transactions: dedupedTransactions,
      investmentAccounts: dedupedInvestmentAccounts,
      investments: dedupedInvestments,
    };
  }

  /**
   * 將財務快照保存到緩存
   */
  private static async saveFinanceSnapshotToCache(userId: string, snapshot: FinanceSnapshot): Promise<void> {
    const syncLog = await getOrCreateSyncLog(userId);

    try {
      // 保存帳戶數據
      if (snapshot.accounts.length > 0) {
        const accountsToCache = snapshot.accounts.map((acc) => {
          const account: any = {
            plaidItemId: '',
            accountId: acc.id,
            name: acc.name,
            balance: FieldEncryption.encryptNumber(acc.balance),
            type: 'bank',
            bucket: 'banking' as const,
            institutionName: acc.name.split('·')[0]?.trim() || 'Bank',
            logo: acc.logo,
          };
          if (acc.plaidLogo) {
            account.plaidLogo = acc.plaidLogo;
          }
          if (acc.apy !== undefined) {
            account.apy = FieldEncryption.encryptOptionalNumber(acc.apy);
          }
          if (acc.mask) {
            account.mask = FieldEncryption.encryptString(acc.mask);
          }
          return account;
        });

        await upsertAccountsCache(userId, accountsToCache);
        await updateSyncTimestamp(userId, 'accounts', { total: accountsToCache.length });

        // 帳戶同步完成後，非同步寫入 AssetSnapshot 以支援折線圖歷史
        AssetService.recordMultipleSnapshots(userId,
          snapshot.accounts.map((acc) => ({
            assetId: acc.id,
            name: acc.name,
            type: 'bank_account' as const,
            value: acc.balance,
          }))
        ).catch((err) => {
          appLogger.warn('Failed to record bank asset snapshots', { userId, error: err?.message });
        });
      }

      // 保存交易數據
      if (snapshot.transactions.length > 0) {
        const transactionsToCache = PlaidTransactionService.formatTransactionsForCache(snapshot.transactions);
        await upsertTransactionsCache(userId, transactionsToCache);
        await updateSyncTimestamp(userId, 'transactions', { total: transactionsToCache.length });
      }

      // 保存投資帳戶數據
      if (snapshot.investmentAccounts.length > 0) {
        const investmentAccountsToCache = snapshot.investmentAccounts.map((acc) => {
          const invAcc: any = {
            accountId: acc.id,
            name: acc.name,
            institutionName: acc.name.split('·')[0]?.trim() || 'Broker',
            logo: acc.logo,
          };
          if (acc.plaidLogo) {
            invAcc.plaidLogo = acc.plaidLogo;
          }
          return invAcc;
        });

        await upsertInvestmentAccountsCache(userId, investmentAccountsToCache);
      }

      // 保存投資持倉數據
      if (snapshot.investments.length > 0) {
        const investmentsToCache = snapshot.investments.map((inv) => ({
          accountId: inv.accountId,
          investmentId: inv.id,
          symbol: inv.symbol,
          name: inv.name,
          holdings: FieldEncryption.encryptNumber(inv.holdings),
          currentPrice: FieldEncryption.encryptNumber(inv.currentPrice),
          change24h: inv.change24h,
          type: inv.type,
          logo: inv.logo,
        }));

        await upsertInvestmentsCache(userId, investmentsToCache);
        await updateSyncTimestamp(userId, 'investments', { total: investmentsToCache.length });

        // 投資持倉同步完成後，非同步寫入 AssetSnapshot
        AssetService.recordMultipleSnapshots(userId,
          snapshot.investments.map((inv) => ({
            assetId: inv.id,
            name: `${inv.symbol} (${inv.name})`,
            type: 'investment' as const,
            value: inv.holdings * inv.currentPrice,
          }))
        ).catch((err) => {
          appLogger.warn('Failed to record investment asset snapshots', { userId, error: err?.message });
        });
      }

      logDebug('Saved finance snapshot to cache', {
        userId,
        accounts: snapshot.accounts.length,
        transactions: snapshot.transactions.length,
        investmentAccounts: snapshot.investmentAccounts.length,
        investments: snapshot.investments.length,
      });
    } catch (error) {
      appLogger.warn('Error saving to cache', { userId, error });
      throw error;
    }
  }
}
