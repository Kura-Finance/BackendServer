/**
 * Plaid 服務 - 外觀層
 * 負責協調專職 Plaid 服務並維持向後相容
 */
import { EncryptedFinanceSnapshot } from './plaidCacheService';
/**
 * 統一的 Plaid 服務門面（Phase 3 Zero-Access E2EE only）。
 *
 * 所有對外 API 都回傳「加密形式」snapshot：後端永不解密 sensitive payload，
 * 前端用 X25519 privateKey unwrap payloadKeys 後解每個 row 的 ciphertext。
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
    /**
     * 優化版：快取未過期 → 直接讀加密 row；過期或手動刷新 → 從 Plaid API 抓 → 加密寫入 → 回讀加密 row。
     */
    static getFinanceSnapshotOptimized(userId: string, isManualRefresh?: boolean): Promise<EncryptedFinanceSnapshot>;
    /**
     * 僅讀快取（不觸發 Plaid API）：回傳目前 cache 中的加密形式 snapshot。
     */
    static getEncryptedFinanceSnapshot(userId: string): Promise<EncryptedFinanceSnapshot>;
    static syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void>;
    static syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void>;
}
//# sourceMappingURL=plaidService.d.ts.map