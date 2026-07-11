"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlaidEnvironmentByUserId = getPlaidEnvironmentByUserId;
exports.createPlaidClientForUser = createPlaidClientForUser;
const plaid_1 = require("plaid");
/**
 * 根據用戶 ID 決定使用 Sandbox 或 Production 環境
 * test@kura-finance.com 用戶（ID: 82f0cfbb-0d93-4802-adba-52e395ccac6e）使用 Sandbox
 * 其他用戶使用 Production
 */
function getPlaidEnvironmentByUserId(userId) {
    // 測試用戶 ID
    const testUserIds = ['82f0cfbb-0d93-4802-adba-52e395ccac6e'];
    return testUserIds.includes(userId) ? 'sandbox' : 'production';
}
/**
 * 根據環境取得對應的 Plaid Secret
 */
function getPlaidSecret(environment) {
    if (environment === 'sandbox') {
        const secret = process.env.PLAID_SANDBOX_SECRET;
        if (!secret) {
            throw new Error('PLAID_SANDBOX_SECRET environment variable is not set');
        }
        return secret;
    }
    else {
        const secret = process.env.PLAID_PRODUCTION_SECRET;
        if (!secret) {
            throw new Error('PLAID_PRODUCTION_SECRET environment variable is not set');
        }
        return secret;
    }
}
/**
 * 為指定用戶創建 Plaid API Client
 * @param userId - 用戶的 ID
 * @returns 配置好的 PlaidApi 實例
 */
function createPlaidClientForUser(userId) {
    const environment = getPlaidEnvironmentByUserId(userId);
    const basePath = plaid_1.PlaidEnvironments[environment];
    if (!basePath) {
        throw new Error(`Invalid Plaid environment: ${environment}`);
    }
    const clientId = process.env.PLAID_CLIENT_ID;
    if (!clientId) {
        throw new Error('PLAID_CLIENT_ID environment variable is not set');
    }
    const secret = getPlaidSecret(environment);
    const configuration = new plaid_1.Configuration({
        basePath,
        baseOptions: {
            headers: {
                'PLAID-CLIENT-ID': clientId,
                'PLAID-SECRET': secret,
            },
        },
    });
    return new plaid_1.PlaidApi(configuration);
}
//# sourceMappingURL=plaidClientFactory.js.map