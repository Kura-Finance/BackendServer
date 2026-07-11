/**
 * Plaid 帳戶服務
 * 處理帳戶相關操作：讀取、排序與斷線
 */
import { PlaidAccountPayload, PlaidInvestmentAccountPayload } from '../models/types';
export declare class PlaidAccountService {
    /**
     * 斷開 Plaid Item 連接（會移除整個 Item 及其底下所有帳戶）
     */
    static disconnectItemByAccountId(userId: string, accountId: string): Promise<{
        plaidRequestId?: string;
        accountId: string;
        disconnectedItemId?: string;
        institution?: string;
    }>;
    /**
     * 取得帳戶（包括 APY 信息）
     */
    static fetchAccountsWithAPY(userPlaidClient: any, item: {
        institutionName: string;
    }, decryptedAccessToken: string): Promise<{
        bankingAccounts: PlaidAccountPayload[];
        investmentAccounts: PlaidInvestmentAccountPayload[];
    }>;
}
//# sourceMappingURL=plaidAccountService.d.ts.map