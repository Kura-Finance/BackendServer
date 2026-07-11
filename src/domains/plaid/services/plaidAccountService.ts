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

export class PlaidAccountService {
  /**
   * 斷開 Plaid Item 連接（會移除整個 Item 及其底下所有帳戶）
   */
  static async disconnectItemByAccountId(
    userId: string,
    accountId: string
  ): Promise<{ plaidRequestId?: string; accountId: string; disconnectedItemId?: string; institution?: string }> {
    const startTime = Date.now();
    try {
      logDebug('Disconnecting Plaid account', { userId, accountId });

      // 根據用戶 ID 取得對應的 Plaid Client
      const userPlaidClient = createPlaidClientForUser(userId);

      const dbStartTime = Date.now();
      const plaidItems = await prisma.plaidItem.findMany({
        where: { userId },
        select: {
          id: true,
          itemId: true,
          accessToken: true,
          institutionName: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      logDatabaseOperation('SELECT', 'plaid_items', Date.now() - dbStartTime, true);

      let matchedPlaidItemId: string | null = null;
      let matchedAccessToken: string | null = null;
      let institutionName: string | null = null;

      for (const item of plaidItems) {
        try {
          const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem({ accessToken: item.accessToken, itemId: item.itemId });
          const accountsResponse = await userPlaidClient.accountsGet({
            access_token: decryptedAccessToken,
          });

          const hasAccount = accountsResponse.data.accounts.some((account) => account.account_id === accountId);

          if (hasAccount) {
            matchedPlaidItemId = item.id;
            matchedAccessToken = decryptedAccessToken;
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

      if (!matchedPlaidItemId || !matchedAccessToken) {
        return { accountId };
      }

      // 調用 Plaid itemRemove API 以禁用訪問令牌
      let plaidRequestId: string | undefined;
      try {
        const removeResponse = await userPlaidClient.itemRemove({
          access_token: matchedAccessToken,
        });
        plaidRequestId = removeResponse.data.request_id;
        logDebug('Plaid itemRemove called successfully', { userId, accountId, requestId: plaidRequestId });
      } catch (error: any) {
        // 記錄警告但繼續刪除本地記錄（防止壞帳）
        appLogger.warn('Failed to call itemRemove on Plaid API', {
          error: error.response?.data || error.message || error,
          userId,
          accountId,
          plaidItemId: matchedPlaidItemId,
        });
        logError('Plaid itemRemove failed during disconnect', error, { userId, accountId });
      }

      const deleteStartTime = Date.now();
      // 刪除 Plaid Item 即可：四張快取表（account / transaction / investmentAccount /
      // investment）皆以 plaidItemId relation 對 PlaidItem 設定 onDelete: Cascade，
      // 因此底下所有帳戶、交易、投資快取會由資料庫連帶刪除，不會殘留舊資料。
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

      const response: { plaidRequestId?: string; accountId: string; disconnectedItemId?: string; institution?: string } = {
        accountId,
        disconnectedItemId: matchedPlaidItemId,
      };
      if (plaidRequestId) response.plaidRequestId = plaidRequestId;
      if (institutionName) response.institution = institutionName;
      return response;
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
