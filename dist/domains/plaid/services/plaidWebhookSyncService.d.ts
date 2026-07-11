/**
 * Plaid Webhook 同步服務
 * 處理由 webhook 觸發的交易與投資資料同步
 */
export declare class PlaidWebhookSyncService {
    /**
     * 從 Webhook 觸發的交易同步
     */
    static syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void>;
    /**
     * 從 Webhook 觸發的投資數據同步
     */
    static syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void>;
}
//# sourceMappingURL=plaidWebhookSyncService.d.ts.map