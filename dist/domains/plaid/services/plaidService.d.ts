import { StoredAccountOrderPayload, FinanceSnapshot } from '../models/types';
/**
 * Plaid Service - Business Logic Layer
 */
export declare class PlaidService {
    /**
     * 更新账户排序
     */
    static updateAccountOrder(userId: string, payload: StoredAccountOrderPayload): Promise<void>;
    /**
     * 创建 Link Token
     */
    static createLinkToken(userId: string): Promise<string>;
    /**
     * 交换 Public Token
     */
    static exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void>;
    /**
     * 断开 Plaid 账户
     */
    static disconnectAccount(userId: string, accountId: string): Promise<void>;
    /**
     * 获取财务快照（带缓存）
     * 如果缓存未过期，直接从缓存获取；否则从 Plaid API 获取并保存缓存
     * @param userId 用户 ID
     * @param forceRefresh 是否强制刷新（忽略缓存）
     */
    static getFinanceSnapshotOptimized(userId: string, forceRefresh?: boolean): Promise<FinanceSnapshot>;
    /**
     * 将财务快照保存到缓存
     */
    private static saveFinanceSnapshotToCache;
    /**
     * 获取财务快照
     */
    static getFinanceSnapshot(userId: string): Promise<FinanceSnapshot>;
    /**
     * 獲取並解密 PlaidItem
     */
    private static decryptPlaidItem;
    /**
     * 從 Webhook 觸發的交易同步
     * 當收到 TRANSACTIONS: SYNC_UPDATES_AVAILABLE webhook 時調用
     * 後端主動拉取最新交易，不需要等前端請求
     */
    static syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void>;
    /**
     * 從 Webhook 觸發的投資數據同步
     * 當收到 INVESTMENTS_TRANSACTIONS: SYNC_UPDATES_AVAILABLE webhook 時調用
     */
    static syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void>;
}
//# sourceMappingURL=plaidService.d.ts.map