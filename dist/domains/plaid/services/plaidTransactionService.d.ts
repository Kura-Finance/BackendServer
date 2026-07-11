/**
 * Plaid 交易服務
 * 處理交易資料讀取、分類與補強
 */
import { PlaidTransactionPayload } from '../models/types';
export declare class PlaidTransactionService {
    private static extractPlaidMerchantLogo;
    static fetchTransactions(userPlaidClient: any, decryptedAccessToken: string, cursor?: string): Promise<{
        transactions: PlaidTransactionPayload[];
        removedTransactionIds: string[];
        nextCursor?: string;
        accountsMetadata: Map<string, {
            name: string;
            type: string;
            subtype?: string | null;
        }>;
    }>;
    /**
     * 格式化單筆交易
     */
    private static formatTransaction;
    /**
     * 識別定期交易和訂閱
     */
    private static identifyRecurringTransactions;
    /**
     * 為緩存格式化交易
     */
    static formatTransactionsForCache(transactions: PlaidTransactionPayload[]): Array<{
        accountId: string;
        transactionId: string;
        merchant: string;
        amount: string;
        category: string;
        type: string;
        date: string;
        month: string;
        personalFinanceCategory?: string;
        isRecurring?: boolean;
        recurringFrequency?: string;
        isSubscription?: boolean;
        enrichedMerchantName?: string;
        merchantLogo?: string;
        merchantCategory?: string;
        isPending?: boolean;
    }>;
}
//# sourceMappingURL=plaidTransactionService.d.ts.map