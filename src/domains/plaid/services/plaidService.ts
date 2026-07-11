/**
 * Plaid 服務 - 外觀層
 * 負責協調專職 Plaid 服務並維持向後相容
 */

import { PlaidAuthService } from './plaidAuthService';
import { PlaidAccountService } from './plaidAccountService';
import { PlaidCacheService } from './plaidCacheService';
import { PlaidWebhookSyncService } from './plaidWebhookSyncService';
import { FinanceSnapshot } from '../models/types';

/**
 * 統一的 Plaid 服務門面
 * 提供簡潔的公開 API，內部委託給專門服務
 */
export class PlaidService {
  // ===== 驗證 =====
  static async createLinkToken(userId: string): Promise<string> {
    return PlaidAuthService.createLinkToken(userId);
  }

  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    return PlaidAuthService.exchangePublicToken(userId, publicToken, institutionName);
  }

  // ===== 帳戶管理 =====
  static async disconnectItemByAccountId(
    userId: string,
    accountId: string
  ): Promise<{ plaidRequestId?: string; accountId: string; disconnectedItemId?: string; institution?: string }> {
    return PlaidAccountService.disconnectItemByAccountId(userId, accountId);
  }

  // ===== 快取與同步 =====
  static async getFinanceSnapshotOptimized(userId: string, isManualRefresh: boolean = false): Promise<FinanceSnapshot> {
    return PlaidCacheService.getFinanceSnapshotOptimized(userId, isManualRefresh);
  }

  static async getFinanceSnapshot(userId: string): Promise<FinanceSnapshot> {
    return PlaidCacheService.getFinanceSnapshot(userId);
  }

  // ===== Webhook 同步 =====
  static async syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncTransactionsFromWebhook(userId, itemId);
  }

  static async syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncInvestmentsFromWebhook(userId, itemId);
  }
}
