import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

/**
 * 根據用戶 ID 決定使用 Sandbox 或 Production 環境。
 * 設定 `PLAID_SANDBOX_USER_IDS`（逗號分隔 UUID）的用戶走 Sandbox；其餘走 Production。
 * 未設定時全部使用 Production。
 */
export function getPlaidEnvironmentByUserId(userId: string): 'sandbox' | 'production' {
  const sandboxUserIds = (process.env.PLAID_SANDBOX_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return sandboxUserIds.includes(userId) ? 'sandbox' : 'production';
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
  return createPlaidClient(environment);
}

export function createPlaidClient(environment: 'sandbox' | 'production'): PlaidApi {
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

export function createPlaidWebhookClient(): PlaidApi {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  const environment: 'sandbox' | 'production' = env === 'production' ? 'production' : 'sandbox';
  return createPlaidClient(environment);
}
