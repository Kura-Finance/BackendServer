/**
 * Plaid client factory — Sandbox vs Production by user allowlist.
 *
 * Users listed in `PLAID_SANDBOX_USER_IDS` (comma-separated UUIDs) use Sandbox;
 * everyone else uses Production. When unset, all users use Production.
 */
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

/** Resolve Sandbox or Production for a user id. */
export function getPlaidEnvironmentByUserId(userId: string): 'sandbox' | 'production' {
  const sandboxUserIds = (process.env.PLAID_SANDBOX_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return sandboxUserIds.includes(userId) ? 'sandbox' : 'production';
}

/** Plaid secret for the given environment. */
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
 * Build a PlaidApi client for the user's environment.
 * @param userId - authenticated user id
 * @returns configured PlaidApi instance
 */
export function createPlaidClientForUser(userId: string): PlaidApi {
  const environment = getPlaidEnvironmentByUserId(userId);
  return createPlaidClient(environment);
}

/** Build a PlaidApi client for an explicit environment. */
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

/** Plaid client for webhook verification (uses PLAID_ENV, default sandbox). */
export function createPlaidWebhookClient(): PlaidApi {
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  const environment: 'sandbox' | 'production' = env === 'production' ? 'production' : 'sandbox';
  return createPlaidClient(environment);
}
