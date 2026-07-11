import { plaidClient } from '../lib/plaid';
import { createPlaidClientForUser } from '../lib/plaidClientFactory';
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
import { getStockLogoUrl } from '../lib/stockIconUtil';
import { prisma } from '../../shared/lib/prisma';
import { CountryCode, Products } from 'plaid';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { EncryptionUtil } from '../../shared/lib/encryption';
import {
  BankingAccountType,
  TransactionType,
  InvestmentAccountType,
  InvestmentType,
  PlaidAccountBucket,
  PlaidAccountPayload,
  PlaidTransactionPayload,
  PlaidInvestmentAccountPayload,
  PlaidInvestmentPayload,
  StoredAccountOrderPayload,
  FinanceSnapshot,
} from '../models/types';

const PLAID_FALLBACK_LOGO = 'https://www.google.com/s2/favicons?domain=plaid.com&sz=128';

/**
 * Plaid Helper Functions
 */
const mapPlaidAccountType = (type: string, subtype?: string | null): BankingAccountType => {
  const normalizedSubtype = (subtype || '').toLowerCase();
  if (type === 'credit') {
    return 'credit';
  }
  if (normalizedSubtype.includes('saving')) {
    return 'saving';
  }
  if (normalizedSubtype.includes('check')) {
    return 'checking';
  }
  return 'checking';
};

const mapPlaidTransactionType = (amount: number, category?: string | null): TransactionType => {
  const normalizedCategory = (category || '').toLowerCase();
  if (normalizedCategory.includes('transfer')) {
    return 'transfer';
  }
  return amount < 0 ? 'deposit' : 'credit';
};

const mapPlaidInvestmentType = (securityType?: string | null): InvestmentType => {
  const normalized = (securityType || '').toLowerCase();
  return normalized.includes('crypto') ? 'crypto' : 'stock';
};

const classifyPlaidAccountBucket = (type?: string | null, subtype?: string | null): PlaidAccountBucket => {
  const normalizedType = (type || '').toLowerCase();
  const normalizedSubtype = (subtype || '').toLowerCase();

  const investmentSubtypeHints = [
    'brokerage',
    'broker',
    'hsa',
    'ira',
    '401k',
    '401(a)',
    '401',
    '403b',
    '457',
    'retirement',
  ];

  if (normalizedType === 'investment') {
    return 'investment';
  }

  if (investmentSubtypeHints.some((hint) => normalizedSubtype.includes(hint))) {
    return 'investment';
  }

  return 'banking';
};

const normalizeStoredOrder = (ids?: string[]) => {
  if (!ids) {
    return [] as string[];
  }

  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
};

const orderItemsByStoredIds = <T extends { id: string }>(items: T[], orderedIds: string[]) => {
  if (orderedIds.length === 0) {
    return items;
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = orderedIds
    .map((id) => itemById.get(id))
    .filter((item): item is T => Boolean(item));
  const orderedIdSet = new Set(orderedIds);
  const remainingItems = items.filter((item) => !orderedIdSet.has(item.id));

  return [...orderedItems, ...remainingItems];
};

/**
 * 獲取用戶的 email
 */
const getUserEmail = async (userId: string): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) {
    throw new Error(`User not found or email is missing for userId: ${userId}`);
  }

  return user.email;
};

/**
 * Plaid Service - Business Logic Layer
 */
export class PlaidService {
  /**
   * 更新账户排序
   */
  static async updateAccountOrder(userId: string, payload: StoredAccountOrderPayload): Promise<void> {
    if (payload.accountIds === undefined && payload.investmentAccountIds === undefined) {
      throw new Error('accountIds or investmentAccountIds is required');
    }

    const data: { bankingAccountOrder?: string[]; investmentAccountOrder?: string[] } = {};

    if (payload.accountIds !== undefined) {
      data.bankingAccountOrder = normalizeStoredOrder(payload.accountIds);
    }

    if (payload.investmentAccountIds !== undefined) {
      data.investmentAccountOrder = normalizeStoredOrder(payload.investmentAccountIds);
    }

    logDebug('Updating account order', { userId, data: Object.keys(data) });

    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data,
    });
    logDatabaseOperation('UPDATE', 'users', Date.now() - startTime, true);

    logBusinessEvent('account_order_updated', userId, {
      bankingAccountCount: payload.accountIds?.length || 0,
      investmentAccountCount: payload.investmentAccountIds?.length || 0,
    });
  }

  /**
   * 创建 Link Token
   */
  static async createLinkToken(userId: string): Promise<string> {
    const startTime = Date.now();
    
    // 根據用戶 email 獲取相應的 Plaid Client
    const userEmail = await getUserEmail(userId);
    const userPlaidClient = createPlaidClientForUser(userEmail);
    
    // Plaid 要求 redirect_uri 必須使用 HTTPS (安全要求)
    // 優先使用 PLAID_REDIRECT_URI 環境變數，必須是 HTTPS URL
    let plaidRedirectUri = process.env.PLAID_REDIRECT_URI;
    
    if (!plaidRedirectUri) {
      // 如果未設定環境變數，則根據環境生成預設值
      // 開發環境: 使用 FRONTEND_HOST 或 localhost:3000 (使用自簽憑證)
      // 生產環境: 必須在環境變數中明確設定 PLAID_REDIRECT_URI
      const frontendHost = process.env.ALLOWED_ORIGINS?.split(',')[0]?.replace('http://', '').replace('https://', '') || 'localhost:3000';
      
      if (process.env.NODE_ENV === 'production') {
        logError('PLAID_REDIRECT_URI not configured', new Error('Missing required environment variable'), {
          environment: 'production',
        });
        throw new Error('PLAID_REDIRECT_URI 環境變數未設定。請在部署時設定此變數。');
      }
      
      plaidRedirectUri = `https://${frontendHost}/dashboard`;
    }

    logDebug('Creating Plaid link token', {
      userId,
      userEmail,
      redirectUri: plaidRedirectUri,
      environment: process.env.NODE_ENV,
    });

    // 默认只支持 US，可通过环境变量扩展支持的国家代码
    // Plaid 免费层可能只支持 US，高级账户可解锁更多国家
    const supportedCountryCodes = process.env.PLAID_COUNTRY_CODES
      ? process.env.PLAID_COUNTRY_CODES.split(',').map((code) => code.trim().toUpperCase() as CountryCode)
      : [CountryCode.Us];

    const request: any = {
      user: { client_user_id: userId },
      client_name: 'Kura',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: supportedCountryCodes,
      language: 'en',
    };

    request.redirect_uri = plaidRedirectUri;

    logDebug('Link token request payload', {
      userId,
      countryCodes: supportedCountryCodes,
      products: request.products,
    });

    try {
      const response = await userPlaidClient.linkTokenCreate(request);

      const duration = Date.now() - startTime;
      logPerformance('create_link_token', duration, 2000);
      logBusinessEvent('link_token_created', userId, {
        redirectUri: plaidRedirectUri,
        countryCodes: supportedCountryCodes,
      });

      logDebug('Link token created successfully', {
        userId,
        linkToken: response.data.link_token?.substring(0, 10) + '...',
      });

      return response.data.link_token;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorCode = errorData?.error_code;
      const errorMessage = errorData?.error_message;
      const displayMessage = errorData?.display_message;

      logError('Failed to create Plaid link token', error, {
        userId,
        countryCodes: supportedCountryCodes,
        redirectUri: plaidRedirectUri,
        errorCode,
        errorMessage,
        displayMessage,
        errorType: errorData?.error_type,
        requestId: errorData?.request_id,
        rawError: error.message,
      });

      // 国家代码不支持
      if (errorCode === 'INVALID_FIELD' && errorMessage?.includes('country')) {
        throw new Error(
          `Plaid 不支援所選國家代碼 (${supportedCountryCodes.join(', ')})。請確認您的 Plaid 帳戶已啟用這些國家，或更新 PLAID_COUNTRY_CODES 環境變數。`
        );
      }

      // 其他 INVALID_FIELD 錯誤
      if (errorCode === 'INVALID_FIELD') {
        throw new Error(
          `Plaid API 返回無效欄位錯誤: ${displayMessage || errorMessage || '未知錯誤'}。請檢查 PLAID_REDIRECT_URI 設定或其他配置。`
        );
      }

      // Plaid API 連接錯誤
      if (errorCode === 'INVALID_REQUEST') {
        throw new Error(
          `Plaid API 無效請求: ${displayMessage || errorMessage || '請檢查 API 憑證和配置'}。`
        );
      }

      // 通用錯誤
      throw error;
    }
  }

  /**
   * 交换 Public Token
   */
  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // 根據用戶 email 獲取相應的 Plaid Client
      const userEmail = await getUserEmail(userId);
      const userPlaidClient = createPlaidClientForUser(userEmail);

      logDebug('Exchanging Plaid public token', { userId, userEmail, institution: institutionName });

      const response = await userPlaidClient.itemPublicTokenExchange({ public_token: publicToken });
      const accessToken = response.data.access_token;
      const itemId = response.data.item_id;

      // 加密敏感信息
      const encryptedAccessToken = EncryptionUtil.encrypt(accessToken);
      const encryptedItemId = EncryptionUtil.encrypt(itemId);

      const dbStartTime = Date.now();
      const plaidItem = await prisma.plaidItem.create({
        data: {
          userId,
          accessToken: encryptedAccessToken,
          itemId: encryptedItemId,
          institutionName: institutionName || 'Unknown Bank',
        },
      });
      logDatabaseOperation('CREATE', 'plaid_items', Date.now() - dbStartTime, true);

      const duration = Date.now() - startTime;
      logPerformance('exchange_public_token', duration, 3000);
      logBusinessEvent('bank_account_connected', userId, {
        institution: institutionName || 'Unknown',
      });

      // 記錄審計日誌
      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'SUCCESS', plaidItem.id, {
        institution: institutionName || 'Unknown Bank',
      }, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 記錄審計日誌（失敗）
      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'FAILURE', undefined, {
        institution: institutionName,
      }, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * 断开 Plaid 账户
   */
  static async disconnectAccount(userId: string, accountId: string): Promise<void> {
    const startTime = Date.now();
    try {
      logDebug('Disconnecting Plaid account', { userId, accountId });

      // 根據用戶 email 獲取相應的 Plaid Client
      const userEmail = await getUserEmail(userId);
      const userPlaidClient = createPlaidClientForUser(userEmail);

      const dbStartTime = Date.now();
      const plaidItems = await prisma.plaidItem.findMany({
        where: { userId },
        select: {
          id: true,
          accessToken: true,
          institutionName: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      logDatabaseOperation('SELECT', 'plaid_items', Date.now() - dbStartTime, true);

      let matchedPlaidItemId: string | null = null;
      let institutionName: string | null = null;

      for (const item of plaidItems) {
        try {
          const { decryptedAccessToken } = this.decryptPlaidItem(item);
          const accountsResponse = await userPlaidClient.accountsGet({
            access_token: decryptedAccessToken,
          });

          const hasAccount = accountsResponse.data.accounts.some((account) => account.account_id === accountId);

          if (hasAccount) {
            matchedPlaidItemId = item.id;
            institutionName = item.institutionName;
            break;
          }
        } catch (error: any) {
          appLogger.warn('Failed to inspect Plaid item during disconnect', {
            error: error.response?.data || error.message || error,
            userId,
            plaidItemId: item.id,
          });
        }
      }

      if (!matchedPlaidItemId) {
        return;
      }

      const deleteStartTime = Date.now();
      await prisma.plaidItem.delete({
        where: { id: matchedPlaidItemId },
      });
      logDatabaseOperation('DELETE', 'plaid_items', Date.now() - deleteStartTime, true);

      const duration = Date.now() - startTime;
      logBusinessEvent('bank_account_disconnected', userId, {
        accountId,
        institution: institutionName,
      });

      // 記錄審計日誌
      AuditLogger.logPlaidOperation('DISCONNECT', userId, 'SUCCESS', matchedPlaidItemId, {
        institution: institutionName,
        accountId,
      }, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 記錄審計日誌（失敗）
      AuditLogger.logPlaidOperation('DISCONNECT', userId, 'FAILURE', undefined, {
        accountId,
      }, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * 获取财务快照（带缓存）
   * 如果缓存未过期，直接从缓存获取；否则从 Plaid API 获取并保存缓存
   * @param userId 用户 ID
   * @param forceRefresh 是否强制刷新（忽略缓存）
   */
  static async getFinanceSnapshotOptimized(userId: string, forceRefresh: boolean = false): Promise<FinanceSnapshot> {
    const cacheStartTime = Date.now();
    
    // 检查缓存状态
    const shouldRefreshAccounts = forceRefresh || (await shouldRefreshAccountsCache(userId));
    const shouldRefreshTransactions = forceRefresh || (await shouldRefreshTransactionsCache(userId));
    const shouldRefreshInvestments = forceRefresh || (await shouldRefreshInvestmentsCache(userId));

    logDebug('Cache status check', {
      userId,
      shouldRefreshAccounts,
      shouldRefreshTransactions,
      shouldRefreshInvestments,
    });

    // 如果所有缓存都没有过期且不是强制刷新，直接从缓存获取
    if (
      !forceRefresh &&
      !shouldRefreshAccounts &&
      !shouldRefreshTransactions &&
      !shouldRefreshInvestments
    ) {
      logDebug('Using cached data', { userId });

      const [cachedAccounts, cachedTransactions, cachedInvestmentAccounts, cachedInvestments, user] =
        await Promise.all([
          getAccountsFromCache(userId),
          getTransactionsFromCache(userId),
          getInvestmentAccountsFromCache(userId),
          getInvestmentsFromCache(userId),
          prisma.user.findUnique({
            where: { id: userId },
          }),
        ]);

      const cachedDuration = Date.now() - cacheStartTime;
      logPerformance('get_finance_snapshot_cached', cachedDuration, 100);

      // 转换缓存数据为 API 格式
      const accounts: PlaidAccountPayload[] = cachedAccounts.map((acc: any) => ({
        id: acc.accountId,
        name: acc.name,
        balance: acc.balance,
        type: acc.type as BankingAccountType,
        logo: acc.logo,
      }));

      const transactions: PlaidTransactionPayload[] = cachedTransactions.map((tx: any) => ({
        id: tx.transactionId,
        accountId: tx.accountId,
        accountName: tx.accountId,
        accountType: tx.type as BankingAccountType,
        amount: tx.amount,
        date: tx.date,
        merchant: tx.merchant,
        category: tx.category,
        type: tx.type as TransactionType,
      }));

      const investmentAccounts: PlaidInvestmentAccountPayload[] = cachedInvestmentAccounts.map((acc: any) => ({
        id: acc.accountId,
        name: acc.name,
        type: 'Broker',
        logo: acc.logo,
      }));

      const investments: PlaidInvestmentPayload[] = cachedInvestments.map((inv: any) => ({
        id: inv.investmentId,
        accountId: inv.accountId,
        symbol: inv.symbol,
        name: inv.name,
        holdings: inv.holdings,
        currentPrice: inv.currentPrice,
        change24h: 0,
        type: inv.type as InvestmentType,
        logo: getStockLogoUrl(inv.symbol),
      }));

      const userRecord = user as
        | {
            bankingAccountOrder?: string[] | null;
            investmentAccountOrder?: string[] | null;
          }
        | null;

      const orderedAccounts = orderItemsByStoredIds(accounts, userRecord?.bankingAccountOrder ?? []);
      const orderedInvestmentAccounts = orderItemsByStoredIds(
        investmentAccounts,
        userRecord?.investmentAccountOrder ?? []
      );

      logBusinessEvent('finance_snapshot_fetched_from_cache', userId, {
        source: 'cache',
        accountCount: accounts.length,
        transactionCount: transactions.length,
        investmentAccountCount: investmentAccounts.length,
        investmentCount: investments.length,
      });

      return {
        accounts: orderedAccounts,
        transactions,
        investmentAccounts: orderedInvestmentAccounts,
        investments,
      };
    }

    // 否则从 Plaid API 获取数据
    logDebug('Fetching fresh data from Plaid API', { userId });

    const snapshot = await this.getFinanceSnapshot(userId);

    // 异步保存到缓存，不阻塞响应
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
      accountCount: snapshot.accounts.length,
      transactionCount: snapshot.transactions.length,
      investmentAccountCount: snapshot.investmentAccounts.length,
      investmentCount: snapshot.investments.length,
    });

    return snapshot;
  }

  /**
   * 将财务快照保存到缓存
   */
  private static async saveFinanceSnapshotToCache(userId: string, snapshot: FinanceSnapshot): Promise<void> {
    const syncLog = await getOrCreateSyncLog(userId);

    try {
      // 保存账户数据
      if (snapshot.accounts.length > 0) {
        const accountsToCache = snapshot.accounts.map((acc) => ({
          plaidItemId: '', // 我们没有这个信息，但这是可选的
          accountId: acc.id,
          name: acc.name,
          balance: acc.balance,
          type: 'bank',
          bucket: 'banking' as const,
          institutionName: acc.name.split('·')[0]?.trim() || 'Bank',
          logo: acc.logo,
        }));

        await upsertAccountsCache(userId, accountsToCache);
        await updateSyncTimestamp(userId, 'accounts', { total: accountsToCache.length });
      }

      // 保存交易数据
      if (snapshot.transactions.length > 0) {
        const monthNow = new Date().toISOString().slice(0, 7); // YYYY-MM

        const transactionsToCache = snapshot.transactions.map((tx) => ({
          accountId: tx.accountId,
          transactionId: tx.id,
          merchant: tx.merchant,
          amount: tx.amount,
          category: tx.category,
          type: tx.type,
          date: tx.date,
          month: tx.date.slice(0, 7), // YYYY-MM
        }));

        await upsertTransactionsCache(userId, transactionsToCache);
        await updateSyncTimestamp(userId, 'transactions', { total: transactionsToCache.length });
      }

      // 保存投资账户数据
      if (snapshot.investmentAccounts.length > 0) {
        const investmentAccountsToCache = snapshot.investmentAccounts.map((acc) => ({
          accountId: acc.id,
          name: acc.name,
          institutionName: acc.name.split('·')[0]?.trim() || 'Broker',
          logo: acc.logo,
        }));

        await upsertInvestmentAccountsCache(userId, investmentAccountsToCache);
      }

      // 保存投资持仓数据
      if (snapshot.investments.length > 0) {
        const investmentsToCache = snapshot.investments.map((inv) => ({
          accountId: inv.accountId,
          investmentId: inv.id,
          symbol: inv.symbol,
          name: inv.name,
          holdings: inv.holdings,
          currentPrice: inv.currentPrice,
          type: inv.type,
          logo: inv.logo,
        }));

        await upsertInvestmentsCache(userId, investmentsToCache);
        await updateSyncTimestamp(userId, 'investments', { total: investmentsToCache.length });
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

  /**
   * 获取财务快照
   */
  static async getFinanceSnapshot(userId: string): Promise<FinanceSnapshot> {
    const startTime = Date.now();

    logDebug('Fetching finance snapshot', { userId });

    // 根據用戶 email 獲取相應的 Plaid Client
    const userEmail = await getUserEmail(userId);
    const userPlaidClient = createPlaidClientForUser(userEmail);

    const plaidItems = await prisma.plaidItem.findMany({
      where: { userId },
      select: {
        id: true,
        accessToken: true,
        institutionName: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const user = (await prisma.user.findUnique({
      where: { id: userId },
    })) as
      | {
          bankingAccountOrder?: string[] | null;
          investmentAccountOrder?: string[] | null;
        }
      | null;

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

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateString = startDate.toISOString().slice(0, 10);
    const endDateString = new Date().toISOString().slice(0, 10);

    for (const item of plaidItems) {
      let plaidAccountsById = new Map<string, { name: string; type: string; subtype?: string | null }>();
      const accountBucketById = new Map<string, PlaidAccountBucket>();

      try {
        const { decryptedAccessToken } = this.decryptPlaidItem(item);
        const accountsResponse = await userPlaidClient.accountsGet({
          access_token: decryptedAccessToken,
        });

        for (const account of accountsResponse.data.accounts) {
          const bucket = classifyPlaidAccountBucket(account.type, account.subtype);

          plaidAccountsById.set(account.account_id, {
            name: account.name,
            type: account.type,
            subtype: account.subtype,
          });
          accountBucketById.set(account.account_id, bucket);

          if (bucket === 'investment') {
            investmentAccounts.push({
              id: account.account_id,
              name: `${item.institutionName} · ${account.name}`,
              type: 'Broker',
              logo: PLAID_FALLBACK_LOGO,
            });
            continue;
          }

          accounts.push({
            id: account.account_id,
            name: `${item.institutionName} · ${account.name}`,
            balance: Number(account.balances.current || 0),
            type: mapPlaidAccountType(account.type, account.subtype),
            logo: PLAID_FALLBACK_LOGO,
          });
        }
      } catch (error: any) {
        appLogger.warn('Fetch Plaid accounts failed for item', {
          error: error.response?.data || error.message || error,
          plaidItemId: item.id,
          userId,
        });
      }

      try {
        const { decryptedAccessToken } = this.decryptPlaidItem(item);
        const txResponse = await userPlaidClient.transactionsGet({
          access_token: decryptedAccessToken,
          start_date: startDateString,
          end_date: endDateString,
          options: { count: 100 },
        });

        logDebug('Fetched transactions', {
          userId,
          count: txResponse.data.transactions.length,
        });

        for (const tx of txResponse.data.transactions) {
          if (accountBucketById.get(tx.account_id) === 'investment') {
            continue;
          }

          const accountMeta = plaidAccountsById.get(tx.account_id);
          const primaryCategory = tx.personal_finance_category?.primary || tx.category?.[0] || 'Uncategorized';

          transactions.push({
            id: tx.transaction_id,
            accountId: tx.account_id,
            accountName: accountMeta?.name || 'Plaid Account',
            accountType: mapPlaidAccountType(accountMeta?.type || 'depository', accountMeta?.subtype),
            amount: Number(Math.abs(tx.amount)).toFixed(2),
            date: tx.date,
            merchant: tx.merchant_name || tx.name,
            category: primaryCategory,
            type: mapPlaidTransactionType(tx.amount, primaryCategory),
          });

          if (!accountMeta) {
            plaidAccountsById.set(tx.account_id, {
              name: tx.account_owner || 'Plaid Account',
              type: 'depository',
              subtype: null,
            });
          }
        }
      } catch (error: any) {
        appLogger.warn('Fetch Plaid transactions failed for item', {
          error: error.response?.data || error.message || error,
          plaidItemId: item.id,
          userId,
        });
      }

      try {
        const { decryptedAccessToken } = this.decryptPlaidItem(item);
        const holdingsResponse = await userPlaidClient.investmentsHoldingsGet({
          access_token: decryptedAccessToken,
        });

        const securitiesById = new Map(
          holdingsResponse.data.securities.map((security) => [security.security_id, security])
        );

        for (const account of holdingsResponse.data.accounts) {
          if (accountBucketById.get(account.account_id) === 'banking') {
            continue;
          }

          investmentAccounts.push({
            id: account.account_id,
            name: `${item.institutionName} · ${account.name}`,
            type: 'Broker',
            logo: PLAID_FALLBACK_LOGO,
          });
        }

        for (const holding of holdingsResponse.data.holdings) {
          const security = securitiesById.get(holding.security_id);
          if (!security) continue;

          investments.push({
            id: `${holding.account_id}-${holding.security_id}`,
            accountId: holding.account_id,
            symbol: security.ticker_symbol || security.name || 'N/A',
            name: security.name || security.ticker_symbol || 'Unknown Asset',
            holdings: Number(holding.quantity || 0),
            currentPrice: Number(holding.institution_price || 0),
            change24h: 0,
            type: mapPlaidInvestmentType(security.type),
            logo: getStockLogoUrl(security.ticker_symbol || ''),
          });
        }
      } catch (error: any) {
        appLogger.info('No investment holdings available for Plaid item', {
          error: error.response?.data || error.message || error,
          plaidItemId: item.id,
          userId,
        });
      }
    }

    const dedupedAccounts = Array.from(new Map(accounts.map((acc) => [acc.id, acc])).values());
    const dedupedTransactions = Array.from(new Map(transactions.map((tx) => [String(tx.id), tx])).values()).sort(
      (a, b) => (a.date < b.date ? 1 : -1)
    );
    const dedupedInvestmentAccounts = Array.from(
      new Map(investmentAccounts.map((acc) => [acc.id, acc])).values()
    );
    const dedupedInvestments = Array.from(new Map(investments.map((inv) => [inv.id, inv])).values());
    const orderedAccounts = orderItemsByStoredIds(dedupedAccounts, user?.bankingAccountOrder ?? []);
    const orderedInvestmentAccounts = orderItemsByStoredIds(
      dedupedInvestmentAccounts,
      user?.investmentAccountOrder ?? []
    );

    const duration = Date.now() - startTime;
    logPerformance('get_finance_snapshot', duration, 5000);
    logBusinessEvent('finance_snapshot_fetched', userId, {
      accountCount: orderedAccounts.length,
      transactionCount: dedupedTransactions.length,
      investmentAccountCount: dedupedInvestmentAccounts.length,
      investmentCount: dedupedInvestments.length,
    });

    // 記錄審計日誌
    AuditLogger.logPlaidOperation('FETCH_SNAPSHOT', userId, 'SUCCESS', undefined, {
      accountCount: orderedAccounts.length,
      transactionCount: dedupedTransactions.length,
      investmentAccountCount: dedupedInvestmentAccounts.length,
      investmentCount: dedupedInvestments.length,
    }, undefined, duration);

    return {
      accounts: orderedAccounts,
      transactions: dedupedTransactions,
      investmentAccounts: orderedInvestmentAccounts,
      investments: dedupedInvestments,
    };
  }

  /**
   * 獲取並解密 PlaidItem
   */
  private static decryptPlaidItem(item: any): { decryptedAccessToken: string; itemId: string } {
    let decryptedAccessToken: string;
    let decryptedItemId: string;

    try {
      decryptedAccessToken = EncryptionUtil.decrypt(item.accessToken);
    } catch (error) {  
      throw new Error(`Failed to decrypt Plaid access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 如果 itemId 也被存儲為加密，進行解密
    // 否則使用原始值
    try {
      decryptedItemId = item.itemId && item.itemId.includes(':') ? EncryptionUtil.decrypt(item.itemId) : item.itemId;
    } catch (error) {
      decryptedItemId = item.itemId;
    }

    return { decryptedAccessToken, itemId: decryptedItemId };
  }
}
