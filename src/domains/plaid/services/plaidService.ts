import { plaidClient } from '../lib/plaid';
import { prisma } from '../../shared/lib/prisma';
import { CountryCode, Products } from 'plaid';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
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
    const defaultFrontendUrl =
      process.env.NODE_ENV === 'production' ? 'http://localhost:3000' : 'https://localhost:3000';
    const plaidRedirectUri = process.env.PLAID_REDIRECT_URI || `${defaultFrontendUrl}/dashboard`;

    logDebug('Creating Plaid link token', { userId, redirectUri: plaidRedirectUri });

    const request: any = {
      user: { client_user_id: userId },
      client_name: 'Kura',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Us, CountryCode.Gb, CountryCode.Fr, CountryCode.De],
      language: 'en',
    };

    request.redirect_uri = plaidRedirectUri;

    const response = await plaidClient.linkTokenCreate(request);

    const duration = Date.now() - startTime;
    logPerformance('create_link_token', duration, 2000);
    logBusinessEvent('link_token_created', userId, { redirectUri: plaidRedirectUri });

    return response.data.link_token;
  }

  /**
   * 交换 Public Token
   */
  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    const startTime = Date.now();

    logDebug('Exchanging Plaid public token', { userId, institution: institutionName });

    const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    const dbStartTime = Date.now();
    await prisma.plaidItem.create({
      data: {
        userId,
        accessToken,
        itemId,
        institutionName: institutionName || 'Unknown Bank',
      },
    });
    logDatabaseOperation('CREATE', 'plaid_items', Date.now() - dbStartTime, true);

    const duration = Date.now() - startTime;
    logPerformance('exchange_public_token', duration, 3000);
    logBusinessEvent('bank_account_connected', userId, {
      institution: institutionName || 'Unknown',
      itemId,
    });
  }

  /**
   * 断开 Plaid 账户
   */
  static async disconnectAccount(userId: string, accountId: string): Promise<void> {
    logDebug('Disconnecting Plaid account', { userId, accountId });

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
        const accountsResponse = await plaidClient.accountsGet({
          access_token: item.accessToken,
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

    logBusinessEvent('bank_account_disconnected', userId, {
      accountId,
      institution: institutionName,
    });
  }

  /**
   * 获取财务快照
   */
  static async getFinanceSnapshot(userId: string): Promise<FinanceSnapshot> {
    const startTime = Date.now();

    logDebug('Fetching finance snapshot', { userId });

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
        const accountsResponse = await plaidClient.accountsGet({
          access_token: item.accessToken,
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
        const txResponse = await plaidClient.transactionsGet({
          access_token: item.accessToken,
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
        const holdingsResponse = await plaidClient.investmentsHoldingsGet({
          access_token: item.accessToken,
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
            logo: PLAID_FALLBACK_LOGO,
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

    return {
      accounts: orderedAccounts,
      transactions: dedupedTransactions,
      investmentAccounts: orderedInvestmentAccounts,
      investments: dedupedInvestments,
    };
  }
}
