import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

/**
 * 根據用戶 ID 決定使用 Sandbox 或 Production 環境
 * test@kura-finance.com 用戶（ID: 82f0cfbb-0d93-4802-adba-52e395ccac6e）使用 Sandbox
 * 其他用戶使用 Production
 */
export function getPlaidEnvironmentByUserId(userId: string): 'sandbox' | 'production' {
  // 測試用戶 ID
  const testUserIds = ['82f0cfbb-0d93-4802-adba-52e395ccac6e'];
  return testUserIds.includes(userId) ? 'sandbox' : 'production';
}

/**
 * 根據環境取得對應的 Plaid Secret
 */
function getPlaidSecret(environment: 'sandbox' | 'production'): string {
  if (environment === 'sandbox') {
    const secret = process.env.PLAID_SANDBOX_SECRET;
    if (!secret) {
      throw new Error('PLAID_SANDBOX_SECRET environment variable is not set');
    }
    return secret;
  } else {
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
export function createPlaidClientForUser(userId: string): PlaidApi {
  const environment = getPlaidEnvironmentByUserId(userId);
  const basePath = PlaidEnvironments[environment];

  if (!basePath) {
    throw new Error(`Invalid Plaid environment: ${environment}`);
  }

  const clientId = process.env.PLAID_CLIENT_ID;
  if (!clientId) {
    throw new Error('PLAID_CLIENT_ID environment variable is not set');
  }

  const secret = getPlaidSecret(environment);

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(configuration);
}
