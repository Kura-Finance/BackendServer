import { PlaidApi } from 'plaid';
/**
 * 根據用戶 ID 決定使用 Sandbox 或 Production 環境
 * test@kura-finance.com 用戶（ID: 82f0cfbb-0d93-4802-adba-52e395ccac6e）使用 Sandbox
 * 其他用戶使用 Production
 */
export declare function getPlaidEnvironmentByUserId(userId: string): 'sandbox' | 'production';
/**
 * 為指定用戶創建 Plaid API Client
 * @param userId - 用戶的 ID
 * @returns 配置好的 PlaidApi 實例
 */
export declare function createPlaidClientForUser(userId: string): PlaidApi;
export declare function createPlaidClient(environment: 'sandbox' | 'production'): PlaidApi;
export declare function createPlaidWebhookClient(): PlaidApi;
//# sourceMappingURL=plaidClientFactory.d.ts.map