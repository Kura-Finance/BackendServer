/**
 * Plaid account service — fetch (with APY), disconnect, and revoke Items.
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

/** No Plaid Item matched the given accountId during disconnect. */
export class PlaidAccountNotFoundError extends Error {
  constructor(public readonly accountId: string) {
    super(`No linked Plaid account matched accountId: ${accountId}`);
    this.name = 'PlaidAccountNotFoundError';
  }
}

export class PlaidAccountService {
  /** Disconnect a Plaid Item (removes the Item and all accounts under it). */
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
   * Revoke all Plaid Items for a user (itemRemove + delete local rows).
   * Used for E2EE reset, account deletion, etc.
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

  /** Resolve Item via local cache (accountId → plaidItemId), then Plaid API fallback. */
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

  /** Best-effort itemRemove, then delete local PlaidItem (cache cascades). */
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

  /** Fetch accounts and attach APY from liabilities when available. */
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

    // Pull liabilities for APY / interest rates
    try {
      const liabilitiesResponse = await userPlaidClient.liabilitiesGet({
        access_token: decryptedAccessToken,
      });

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

      // Student loan rates
      if (liabilitiesResponse.data.liabilities?.student) {
        for (const studentAccount of liabilitiesResponse.data.liabilities.student) {
          if (studentAccount.account_id && studentAccount.interest_rate_percentage !== undefined) {
            apyByAccountId.set(studentAccount.account_id, studentAccount.interest_rate_percentage);
          }
        }
      }

      // Mortgage rates
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
      // Liabilities may be unavailable; log and continue
      logDebug('Fetch Plaid liabilities (APY data) failed or not available', {
        error: error.response?.data?.error_code || error.message || error,
      });
    }

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
        ...(account.mask ? { mask: account.mask } : {}), // Last 4 digits (optional)
      };
      if ((account as any).logo) {
        bankingAccount.plaidLogo = (account as any).logo;
      }
      const apy = apyByAccountId.get(account.account_id);
      if (apy !== undefined) {
        bankingAccount.apy = apy;
      }
      bankingAccounts.push(bankingAccount);
    }

    return { bankingAccounts, investmentAccounts };
  }
}
