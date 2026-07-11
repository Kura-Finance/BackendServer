"use strict";
/**
 * Plaid 帳戶服務
 * 處理帳戶相關操作：讀取、排序與斷線
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidAccountService = void 0;
const plaidClientFactory_1 = require("../lib/plaidClientFactory");
const prisma_1 = require("../../shared/lib/prisma");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const symbolsAndExchangesUtil_1 = require("../../shared/lib/symbolsAndExchangesUtil");
const plaidDataTransformer_1 = require("../lib/plaidDataTransformer");
const plaidAuthService_1 = require("./plaidAuthService");
class PlaidAccountService {
    /**
     * 斷開 Plaid Item 連接（會移除整個 Item 及其底下所有帳戶）
     */
    static async disconnectItemByAccountId(userId, accountId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Disconnecting Plaid account', { userId, accountId });
            // 根據用戶 ID 取得對應的 Plaid Client
            const userPlaidClient = (0, plaidClientFactory_1.createPlaidClientForUser)(userId);
            const dbStartTime = Date.now();
            const plaidItems = await prisma_1.prisma.plaidItem.findMany({
                where: { userId },
                select: {
                    id: true,
                    itemId: true,
                    accessToken: true,
                    institutionName: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            (0, logger_1.logDatabaseOperation)('SELECT', 'plaid_items', Date.now() - dbStartTime, true);
            let matchedPlaidItemId = null;
            let matchedAccessToken = null;
            let institutionName = null;
            for (const item of plaidItems) {
                try {
                    const { decryptedAccessToken } = plaidAuthService_1.PlaidAuthService.decryptPlaidItem({ accessToken: item.accessToken, itemId: item.itemId });
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
                }
                catch (error) {
                    logger_1.appLogger.warn('Failed to inspect Plaid item during disconnect', {
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
            let plaidRequestId;
            try {
                const removeResponse = await userPlaidClient.itemRemove({
                    access_token: matchedAccessToken,
                });
                plaidRequestId = removeResponse.data.request_id;
                (0, logger_1.logDebug)('Plaid itemRemove called successfully', { userId, accountId, requestId: plaidRequestId });
            }
            catch (error) {
                // 記錄警告但繼續刪除本地記錄（防止壞帳）
                logger_1.appLogger.warn('Failed to call itemRemove on Plaid API', {
                    error: error.response?.data || error.message || error,
                    userId,
                    accountId,
                    plaidItemId: matchedPlaidItemId,
                });
                (0, logger_1.logError)('Plaid itemRemove failed during disconnect', error, { userId, accountId });
            }
            const deleteStartTime = Date.now();
            await prisma_1.prisma.plaidItem.delete({
                where: { id: matchedPlaidItemId },
            });
            (0, logger_1.logDatabaseOperation)('DELETE', 'plaid_items', Date.now() - deleteStartTime, true);
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('bank_account_disconnected', userId, {
                accountId,
                institution: institutionName,
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logPlaidOperation('DISCONNECT', userId, 'SUCCESS', matchedPlaidItemId, {
                institution: institutionName,
                accountId,
            }, undefined, duration);
            const response = {
                accountId,
                disconnectedItemId: matchedPlaidItemId,
            };
            if (plaidRequestId)
                response.plaidRequestId = plaidRequestId;
            if (institutionName)
                response.institution = institutionName;
            return response;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            // 記錄審計日誌（失敗）
            auditLog_1.AuditLogger.logPlaidOperation('DISCONNECT', userId, 'FAILURE', undefined, {
                accountId,
            }, errorMsg, duration);
            throw error;
        }
    }
    /**
     * 取得帳戶（包括 APY 信息）
     */
    static async fetchAccountsWithAPY(userPlaidClient, item, decryptedAccessToken) {
        const bankingAccounts = [];
        const investmentAccounts = [];
        const accountsResponse = await userPlaidClient.accountsGet({
            access_token: decryptedAccessToken,
        });
        const apyByAccountId = new Map();
        // 取得 Liabilities 資料以提取 APY 資訊
        try {
            const liabilitiesResponse = await userPlaidClient.liabilitiesGet({
                access_token: decryptedAccessToken,
            });
            // 從 Plaid 的 liabilities 回應中提取 APY 資訊
            if (liabilitiesResponse.data.liabilities?.credit) {
                for (const creditAccount of liabilitiesResponse.data.liabilities.credit) {
                    if (creditAccount.account_id && creditAccount.aprs && creditAccount.aprs.length > 0) {
                        const primaryApr = creditAccount.aprs.find((apr) => apr.apr_type === 'purchase_apr');
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
                    if (mortgageAccount.account_id &&
                        mortgageAccount.interest_rate?.percentage !== undefined &&
                        mortgageAccount.interest_rate.percentage !== null) {
                        apyByAccountId.set(mortgageAccount.account_id, mortgageAccount.interest_rate.percentage);
                    }
                }
            }
        }
        catch (error) {
            // Liabilities 呼叫可能失敗，記錄但不中斷流程
            (0, logger_1.logDebug)('Fetch Plaid liabilities (APY data) failed or not available', {
                error: error.response?.data?.error_code || error.message || error,
            });
        }
        // 處理帳戶
        for (const account of accountsResponse.data.accounts) {
            const bucket = (0, plaidDataTransformer_1.classifyPlaidAccountBucket)(account.type, account.subtype);
            if (bucket === 'investment') {
                const investmentAccount = {
                    id: account.account_id,
                    name: `${item.institutionName} · ${account.name}`,
                    type: 'Broker',
                    logo: (0, symbolsAndExchangesUtil_1.getInstitutionLogoUrl)(item.institutionName),
                };
                if (account.logo) {
                    investmentAccount.plaidLogo = account.logo;
                }
                investmentAccounts.push(investmentAccount);
                continue;
            }
            const bankingAccount = {
                id: account.account_id,
                name: `${item.institutionName} · ${account.name}`,
                balance: Number(account.balances.current || 0),
                type: (0, plaidDataTransformer_1.mapPlaidAccountType)(account.type, account.subtype),
                logo: (0, symbolsAndExchangesUtil_1.getInstitutionLogoUrl)(item.institutionName),
                ...(account.mask ? { mask: account.mask } : {}), // 帳號末 4 碼（部分機構不提供）
            };
            if (account.logo) {
                bankingAccount.plaidLogo = account.logo;
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
exports.PlaidAccountService = PlaidAccountService;
//# sourceMappingURL=plaidAccountService.js.map