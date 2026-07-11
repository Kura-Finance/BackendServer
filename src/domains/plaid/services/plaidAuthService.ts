/**
 * Plaid 驗證服務
 * 處理權杖建立、交換與憑證管理
 */

import { createPlaidClientForUser } from '../lib/plaidClientFactory';
import { prisma } from '../../shared/lib/prisma';
import { CountryCode, Products } from 'plaid';
import { logError, logBusinessEvent, logPerformance, logDebug, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { EncryptionUtil } from '../../shared/lib/encryption';

export class PlaidAuthService {
  /**
   * 建立 Link 權杖
   */
  static async createLinkToken(userId: string): Promise<string> {
    const startTime = Date.now();

    // 根據用戶 ID 取得對應的 Plaid Client
    const userPlaidClient = createPlaidClientForUser(userId);

    // Plaid 要求 redirect_uri 必須使用 HTTPS (安全要求)
    // 優先使用 PLAID_REDIRECT_URI 環境變數，必須是 HTTPS URL
    let plaidRedirectUri = process.env.PLAID_REDIRECT_URI;

    if (!plaidRedirectUri) {
      // 如果未設定環境變數，則根據環境生成預設值
      // 開發環境：智慧選擇合適的網頁應用位址（優先 localhost，避免選到 mobile app）
      // 生產環境：必須在環境變數中明確設定 PLAID_REDIRECT_URI

      if (process.env.NODE_ENV === 'production') {
        logError('PLAID_REDIRECT_URI not configured', new Error('Missing required environment variable'), {
          environment: 'production',
        });
        throw new Error('PLAID_REDIRECT_URI is not configured. Please set this environment variable for deployment.');
      }

      // 從 ALLOWED_ORIGINS 選擇合適的網頁應用位址
      // 優先順序：:3000/:3001（Web 連接埠）> localhost > IP 位址
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      let selectedOrigin = 'localhost:3000'; // 預設值

      // 優先選擇包含 :3000 或 :3001 的 localhost 位址
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

    // 預設僅支援 US，可透過環境變數擴展支援的國家代碼
    // Plaid 免費層可能只支援 US，高級帳戶可解鎖更多國家
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

    // 加入 Webhook URL（若已設定環境變數）
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

      // 國家代碼不支援
      if (errorCode === 'INVALID_FIELD' && errorMessage?.includes('country')) {
        throw new Error(
          `Plaid does not support the selected country codes (${supportedCountryCodes.join(', ')}). Please verify your Plaid account has these countries enabled or update PLAID_COUNTRY_CODES.`
        );
      }

      // 其他 INVALID_FIELD 錯誤
      if (errorCode === 'INVALID_FIELD') {
        throw new Error(
          `Plaid API returned an INVALID_FIELD error: ${displayMessage || errorMessage || 'Unknown error'}. Please check PLAID_REDIRECT_URI and related configuration.`
        );
      }

      // Plaid API 連線錯誤
      if (errorCode === 'INVALID_REQUEST') {
        throw new Error(
          `Plaid API returned INVALID_REQUEST: ${displayMessage || errorMessage || 'Please check API credentials and configuration'}.`
        );
      }

      // 通用錯誤
      throw error;
    }
  }

  /**
   * 交換 Public Token 為 Access Token
   */
  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    const startTime = Date.now();

    try {
    // 根據用戶 ID 取得對應的 Plaid Client
      const userPlaidClient = createPlaidClientForUser(userId);

      logDebug('Exchanging Plaid public token', { userId, institution: institutionName });

      const response = await userPlaidClient.itemPublicTokenExchange({ public_token: publicToken });
      const accessToken = response.data.access_token;
      const itemId = response.data.item_id;

      // 加密敏感信息
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

      // 記錄審計日誌
      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'SUCCESS', plaidItem.id, {
        institution: institutionName || 'Unknown Bank',
      }, undefined, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 記錄審計日誌（失敗）
      AuditLogger.logPlaidOperation('EXCHANGE_TOKEN', userId, 'FAILURE', undefined, {
        institution: institutionName,
      }, errorMsg, duration);

      throw error;
    }
  }

  /**
   * 解密 Plaid Item 的存取權杖
   */
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
