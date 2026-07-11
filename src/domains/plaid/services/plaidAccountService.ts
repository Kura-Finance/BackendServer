/**
 * Plaid 帳戶服務
 * 處理帳戶相關操作：讀取、排序與斷線
 */

import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { getInstitutionLogoUrl } from '../../shared/lib/symbolsAndExchangesUtil';
import {
  PlaidAccountPayload,
  PlaidInvestmentAccountPayload,
} from '../models/types';
import { classifyPlaidAccountBucket, mapPlaidAccountType } from '../lib/plaidDataTransformer';
import { PlaidAuthService } from './plaidAuthService';
import { PayloadKeyService } from '../../shared/services/payloadKeyService';

type PlaidItemRef = {
  id: string;
  itemId: string;
  accessToken: string;
  institutionName: string;
};

/** disconnect 時找不到 accountId 對應的 Plaid Item。 */
export class PlaidAccountNotFoundError extends Error {
  constructor(public readonly accountId: string) {
    super(`No linked Plaid account matched accountId: ${accountId}`);
    this.name = 'PlaidAccountNotFoundError';
  }
}

export class PlaidAccountService {
  /**
   * 斷開 Plaid Item 連接（會移除整個 Item 及其底下所有帳戶）
   */
  static async disconnectItemByAccountId(
    userId: string,
    accountId: string
  ): Promise<{ plaidRequestId?: string; accountId: string; disconnectedItemId: string; institution?: string }> {
    const startTime = Date.now();
    try {
      logDebug('Disconnecting Plaid account', { userId, accountId });

      const item = await this.resolvePlaidItemByAccountId(userId, accountId);
      if (!item) {
        throw new PlaidAccountNotFoundError(accountId);
      }

      const { plaidRequestId } = await this.revokePlaidItem(userId, item, { accountId });

      const duration = Date.now() - startTime;
      logBusinessEvent('bank_account_disconnected', userId, {
        accountId,
        institution: item.institutionName,
      });

      AuditLogger.logPlaidOperation('DISCONNECT', userId, 'SUCCESS', item.id, {
        institution: item.institutionName,
        accountId,
      }, undefined, duration);

      const response: {
        plaidRequestId?: string;
        accountId: string;
        disconnectedItemId: string;
        institution?: string;
      } = {
        accountId,
        disconnectedItemId: item.id,
        institution: item.institutionName,
      };
      if (plaidRequestId) response.plaidRequestId = plaidRequestId;
      return response;
    } catch (error) {
      if (error instanceof PlaidAccountNotFoundError) {
        throw error;
      }

      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      AuditLogger.logPlaidOperation('DISCONNECT', userId, 'FAILURE', undefined, {
        accountId,
      }, errorMsg, duration);

      throw error;
    }
  }

  /**
   * 撤銷使用者所有 Plaid Item（呼叫 itemRemove + 刪除本地紀錄）。
   * 用於 E2EE reset、帳號刪除等需完全斷開銀行連線的場景。
   */
  static async revokeAllItemsForUser(userId: string): Promise<{ revoked: number }> {
    const items = await prisma.plaidItem.findMany({
      where: { userId },
      select: { id: true, accessToken: true, itemId: true, institutionName: true },
    });

    if (items.length === 0) {
      return { revoked: 0 };
    }

    for (const item of items) {
      await this.revokePlaidItem(userId, item);
    }

    return { revoked: items.length };
  }

  /** 先查本地快取（accountId → plaidItemId），失敗再 fallback 至 Plaid API。 */
  private static async resolvePlaidItemByAccountId(
    userId: string,
    accountId: string,
  ): Promise<PlaidItemRef | null> {
    const [bankingRow, investmentRow] = await Promise.all([
      prisma.plaidAccountCache.findFirst({
        where: { userId, accountId },
        select: { plaidItemId: true },
      }),
      prisma.plaidInvestmentAccountCache.findFirst({
        where: { userId, accountId },
        select: { plaidItemId: true },
      }),
    ]);

    const cachedPlaidItemId = bankingRow?.plaidItemId ?? investmentRow?.plaidItemId;
    if (cachedPlaidItemId) {
      const item = await prisma.plaidItem.findFirst({
        where: { id: cachedPlaidItemId, userId },
        select: { id: true, itemId: true, accessToken: true, institutionName: true },
      });
      if (item) {
        return item;
      }
    }

    const userPlaidClient = createPlaidClientForUser(userId);
    const plaidItems = await prisma.plaidItem.findMany({
      where: { userId },
      select: { id: true, itemId: true, accessToken: true, institutionName: true },
      orderBy: { createdAt: 'desc' },
    });

    for (const item of plaidItems) {
      try {
        const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem({
          accessToken: item.accessToken,
          itemId: item.itemId,
        });
        const accountsResponse = await userPlaidClient.accountsGet({
          access_token: decryptedAccessToken,
        });

        const hasAccount = accountsResponse.data.accounts.some(
          (account) => account.account_id === accountId,
        );
        if (hasAccount) {
          return item;
        }
      } catch (error: any) {
        appLogger.warn('Failed to inspect Plaid item during disconnect', {
          error: error.response?.data || error.message || error,
          userId,
          plaidItemId: item.id,
        });
      }
    }

    return null;
  }

  /** 呼叫 itemRemove（best-effort）並刪除本地 PlaidItem（快取 cascade）。 */
  private static async revokePlaidItem(
    userId: string,
    item: PlaidItemRef,
    context?: { accountId?: string },
  ): Promise<{ plaidRequestId?: string }> {
    const userPlaidClient = createPlaidClientForUser(userId);
    let plaidRequestId: string | undefined;

    try {
      const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem({
        accessToken: item.accessToken,
        itemId: item.itemId,
      });
      const removeResponse = await userPlaidClient.itemRemove({
        access_token: decryptedAccessToken,
      });
      plaidRequestId = removeResponse.data.request_id;
      logDebug('Plaid itemRemove called successfully', {
        userId,
        plaidItemId: item.id,
        accountId: context?.accountId,
        requestId: plaidRequestId,
      });
    } catch (error: any) {
      appLogger.warn('Failed to call itemRemove on Plaid API', {
        error: error.response?.data || error.message || error,
        userId,
        plaidItemId: item.id,
        accountId: context?.accountId,
      });
      logError('Plaid itemRemove failed during disconnect', error, {
        userId,
        plaidItemId: item.id,
        accountId: context?.accountId,
      });
    }

    const deleteStartTime = Date.now();
    await prisma.plaidItem.delete({ where: { id: item.id } });
    logDatabaseOperation('DELETE', 'plaid_items', Date.now() - deleteStartTime, true);

    try {
      await PayloadKeyService.deleteOrphanedKeys(userId, 0);
    } catch (error) {
      appLogger.warn('Failed to GC orphaned payload keys after Plaid disconnect', {
        userId,
        plaidItemId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return plaidRequestId ? { plaidRequestId } : {};
  }

  /**
   * 取得帳戶（包括 APY 信息）
   */
  static async fetchAccountsWithAPY(
    userPlaidClient: any,
    item: { institutionName: string },
    decryptedAccessToken: string,
  ): Promise<{ bankingAccounts: PlaidAccountPayload[]; investmentAccounts: PlaidInvestmentAccountPayload[] }> {
    const bankingAccounts: PlaidAccountPayload[] = [];
    const investmentAccounts: PlaidInvestmentAccountPayload[] = [];

    const accountsResponse = await userPlaidClient.accountsGet({
      access_token: decryptedAccessToken,
    });

    const apyByAccountId = new Map<string, number>();

      // 取得 Liabilities 資料以提取 APY 資訊
    try {
      const liabilitiesResponse = await userPlaidClient.liabilitiesGet({
        access_token: decryptedAccessToken,
      });

      // 從 Plaid 的 liabilities 回應中提取 APY 資訊
      if (liabilitiesResponse.data.liabilities?.credit) {
        for (const creditAccount of liabilitiesResponse.data.liabilities.credit) {
          if (creditAccount.account_id && creditAccount.aprs && creditAccount.aprs.length > 0) {
            const primaryApr = creditAccount.aprs.find((apr: any) => apr.apr_type === 'purchase_apr');
            if (primaryApr && primaryApr.apr_percentage !== undefined) {
              apyByAccountId.set(creditAccount.account_id, primaryApr.apr_percentage);
            }
          }
        }
      }

      // 學生貸款利率
      if (liabilitiesResponse.data.liabilities?.student) {
        for (const studentAccount of liabilitiesResponse.data.liabilities.student) {
          if (studentAccount.account_id && studentAccount.interest_rate_percentage !== undefined) {
            apyByAccountId.set(studentAccount.account_id, studentAccount.interest_rate_percentage);
          }
        }
      }

      // 抵押貸款帳戶利率
      if (liabilitiesResponse.data.liabilities?.mortgage) {
        for (const mortgageAccount of liabilitiesResponse.data.liabilities.mortgage) {
          if (
            mortgageAccount.account_id &&
            mortgageAccount.interest_rate?.percentage !== undefined &&
            mortgageAccount.interest_rate.percentage !== null
          ) {
            apyByAccountId.set(mortgageAccount.account_id, mortgageAccount.interest_rate.percentage);
          }
        }
      }
    } catch (error: any) {
      // Liabilities 呼叫可能失敗，記錄但不中斷流程
      logDebug('Fetch Plaid liabilities (APY data) failed or not available', {
        error: error.response?.data?.error_code || error.message || error,
      });
    }

    // 處理帳戶
    for (const account of accountsResponse.data.accounts) {
      const bucket = classifyPlaidAccountBucket(account.type, account.subtype);

      if (bucket === 'investment') {
        const investmentAccount: any = {
          id: account.account_id,
          name: `${item.institutionName} · ${account.name}`,
          type: 'Broker',
          logo: getInstitutionLogoUrl(item.institutionName),
        };
        if ((account as any).logo) {
          investmentAccount.plaidLogo = (account as any).logo;
        }
        investmentAccounts.push(investmentAccount);
        continue;
      }

      const bankingAccount: any = {
        id: account.account_id,
        name: `${item.institutionName} · ${account.name}`,
        balance: Number(account.balances.current || 0),
        type: mapPlaidAccountType(account.type, account.subtype),
        logo: getInstitutionLogoUrl(item.institutionName),
        ...(account.mask ? { mask: account.mask } : {}), // 帳號末 4 碼（部分機構不提供）
      };
      if ((account as any).logo) {
        bankingAccount.plaidLogo = (account as any).logo;
      }
      // 加入 APY（如果有）
      const apy = apyByAccountId.get(account.account_id);
      if (apy !== undefined) {
        bankingAccount.apy = apy;
      }
      bankingAccounts.push(bankingAccount);
    }

    return { bankingAccounts, investmentAccounts };
  }
}
