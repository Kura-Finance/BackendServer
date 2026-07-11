/**
 * Plaid 服務 - 外觀層
 * 負責協調專職 Plaid 服務並維持向後相容
 */
import { FinanceSnapshot } from '../models/types';
/**
 * 統一的 Plaid 服務門面
 * 提供簡潔的公開 API，內部委託給專門服務
 */
export declare class PlaidService {
    static createLinkToken(userId: string): Promise<string>;
    static exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void>;
    static disconnectItemByAccountId(userId: string, accountId: string): Promise<{
        plaidRequestId?: string;
        accountId: string;
        disconnectedItemId?: string;
        institution?: string;
    }>;
    static getFinanceSnapshotOptimized(userId: string, isManualRefresh?: boolean): Promise<FinanceSnapshot>;
    static getFinanceSnapshot(userId: string): Promise<FinanceSnapshot>;
    static syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void>;
    static syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void>;
}
//# sourceMappingURL=plaidService.d.ts.map