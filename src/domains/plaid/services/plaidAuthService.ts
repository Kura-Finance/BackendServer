/**
 * Plaid auth service — Link tokens, public-token exchange, credential decrypt.
 */

import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import { CountryCode, Products } from 'plaid';
import { logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { EncryptionUtil } from '../../shared/lib/encryption';

export class PlaidAuthService {
  /** Create a Plaid Link token for the user. */
  static async createLinkToken(userId: string): Promise<string> {
    const startTime = Date.now();

    const userPlaidClient = createPlaidClientForUser(userId);

    // Plaid requires HTTPS redirect_uri. Prefer PLAID_REDIRECT_URI when set.
    let plaidRedirectUri = process.env.PLAID_REDIRECT_URI;

    if (!plaidRedirectUri) {
      // Dev: pick a sensible web origin (prefer localhost web ports over mobile).
      // Production must set PLAID_REDIRECT_URI explicitly.

      if (process.env.NODE_ENV === 'production') {
        logError('PLAID_REDIRECT_URI not configured', new Error('Missing required environment variable'), {
          environment: 'production',
        });
        throw new Error('PLAID_REDIRECT_URI is not configured. Please set this environment variable for deployment.');
      }

      // Prefer :3000/:3001 localhost over other ALLOWED_ORIGINS entries.
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      let selectedOrigin = 'localhost:3000';

      const webAppOrigin = allowedOrigins.find(origin =>
        origin.includes('localhost') && (origin.includes(':3000') || origin.includes(':3001'))
      );
      if (webAppOrigin) {
        selectedOrigin = webAppOrigin.replace('http://', '').replace('https://', '');
      }

      plaidRedirectUri = `https://${selectedOrigin}/dashboard`;
    }

    logDebug('Creating Plaid link token', {
      userId,
      redirectUri: plaidRedirectUri,
      environment: process.env.NODE_ENV,
    });

    // Default US; expand via PLAID_COUNTRY_CODES (comma-separated).
    const supportedCountryCodes = process.env.PLAID_COUNTRY_CODES
      ? process.env.PLAID_COUNTRY_CODES.split(',').map((code) => code.trim().toUpperCase() as CountryCode)
      : [CountryCode.Us];

    const request: any = {
      user: { client_user_id: userId },
      client_name: 'Kura',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: supportedCountryCodes,
      language: 'en',
    };

    request.redirect_uri = plaidRedirectUri;

    if (process.env.PLAID_WEBHOOK_URL) {
      request.webhook = process.env.PLAID_WEBHOOK_URL;
    }

    logDebug('Link token request payload', {
      userId,
      countryCodes: supportedCountryCodes,
      products: request.products,
      hasWebhook: !!request.webhook,
    });

    try {
      const response = await userPlaidClient.linkTokenCreate(request);

      const duration = Date.now() - startTime;
      logPerformance('create_link_token', duration, 2000);
      logBusinessEvent('link_token_created', userId, {
        redirectUri: plaidRedirectUri,
        countryCodes: supportedCountryCodes,
      });

      logDebug('Link token created successfully', {
        userId,
        linkToken: response.data.link_token?.substring(0, 10) + '...',
      });

      return response.data.link_token;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorCode = errorData?.error_code;
      const errorMessage = errorData?.error_message;
      const displayMessage = errorData?.display_message;

      logError('Failed to create Plaid link token', error, {
        userId,
        countryCodes: supportedCountryCodes,
        redirectUri: plaidRedirectUri,
        errorCode,
        errorMessage,
        displayMessage,
        errorType: errorData?.error_type,
        requestId: errorData?.request_id,
        rawError: error.message,
      });

      if (errorCode === 'INVALID_FIELD' && errorMessage?.includes('country')) {
        throw new Error(
          `Plaid does not support the selected country codes (${supportedCountryCodes.join(', ')}). Please verify your Plaid account has these countries enabled or update PLAID_COUNTRY_CODES.`
        );
      }

      if (errorCode === 'INVALID_FIELD') {
        throw new Error(
          `Plaid API returned an INVALID_FIELD error: ${displayMessage || errorMessage || 'Unknown error'}. Please check PLAID_REDIRECT_URI and related configuration.`
        );
      }

      if (errorCode === 'INVALID_REQUEST') {
        throw new Error(
          `Plaid API returned INVALID_REQUEST: ${displayMessage || errorMessage || 'Please check API credentials and configuration'}.`
        );
      }

      throw error;
    }
  }

  /** Exchange a public token for an access token and persist the encrypted Item. */
  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    const startTime = Date.now();

    try {
      const userPlaidClient = createPlaidClientForUser(userId);

      logDebug('Exchanging Plaid public token', { userId, institution: institutionName });

      const response = await userPlaidClient.itemPublicTokenExchange({ public_token: publicToken });
      const accessToken = response.data.access_token;
      const itemId = response.data.item_id;

      const encryptedAccessToken = EncryptionUtil.encrypt(accessToken);
      const encryptedItemId = EncryptionUtil.encrypt(itemId);

      const dbStartTime = Date.now();
      const plaidItem = await prisma.plaidItem.create({
        data: {
          userId,
          accessToken: encryptedAccessToken,
          itemId: encryptedItemId,
          institutionName: institutionName || 'Unknown Bank',
        },
      });
      logDatabaseOperation('CREATE', 'plaid_items', Date.now() - dbStartTime, true);

      const duration = Date.now() - startTime;
      logPerformance('exchange_public_token', duration, 3000);
      logBusinessEvent('bank_account_connected', userId, {
        institution: institutionName || 'Unknown',
      });

      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'SUCCESS', plaidItem.id, {
        institution: institutionName || 'Unknown Bank',
      }, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'FAILURE', undefined, {
        institution: institutionName,
      }, errorMsg, duration);

      throw error;
    }
  }

  /** Decrypt a stored Plaid Item's access token and item id. */
  static decryptPlaidItem(
    item: { accessToken: string; itemId: string },
  ): { decryptedAccessToken: string; decryptedItemId: string } {
    const decryptedAccessToken = EncryptionUtil.decrypt(item.accessToken);
    const decryptedItemId = EncryptionUtil.decrypt(item.itemId);

    return {
      decryptedAccessToken,
      decryptedItemId,
    };
  }
}
