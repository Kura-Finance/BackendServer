/**
 * Plaid 服務 - 外觀層
 * 負責協調專職 Plaid 服務並維持向後相容
 */

import { PlaidAuthService } from './plaidAuthService';
import { PlaidAccountService } from './plaidAccountService';
import { PlaidCacheService, EncryptedFinanceSnapshot } from './plaidCacheService';
import { PlaidWebhookSyncService } from './plaidWebhookSyncService';
import { DemoService } from '../../demo/demoService';

/**
 * 統一的 Plaid 服務門面（Phase 3 Zero-Access E2EE only）。
 *
 * 所有對外 API 都回傳「加密形式」snapshot：後端永不解密 sensitive payload，
 * 前端用 X25519 privateKey unwrap payloadKeys 後解每個 row 的 ciphertext。
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

  // ===== 快取與同步（全部加密形式）=====
  /**
   * 優化版：快取未過期 → 直接讀加密 row；過期或手動刷新 → 從 Plaid API 抓 → 加密寫入 → 回讀加密 row。
   */
  static async getFinanceSnapshotOptimized(
    userId: string,
    isManualRefresh: boolean = false,
  ): Promise<EncryptedFinanceSnapshot> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.plaidSnapshot(userId);
    }
    return PlaidCacheService.getFinanceSnapshotOptimized(userId, isManualRefresh);
  }

  /**
   * 加密財務快照讀取：快取未過期直接回傳；過期則從 Plaid 刷新並寫入 AssetSnapshot 歷史。
   *
   * Mobile 只打 `/finance-snapshot/encrypted`。若此路徑永遠只讀 cache、從不觸發
   * `saveFinanceSnapshotToCache`，Broker 頁的資產歷史會一直空白，顯示
   * 「No performance data yet」（webhook 更新 holdings 也不會寫 AssetSnapshot）。
   */
  static async getEncryptedFinanceSnapshot(userId: string): Promise<EncryptedFinanceSnapshot> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.plaidSnapshot(userId);
    }
    await PlaidCacheService.ensureInvestmentHistorySeeded(userId);
    return PlaidCacheService.getFinanceSnapshotOptimized(userId, false);
  }

  // ===== Webhook 同步 =====
  static async syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncTransactionsFromWebhook(userId, itemId);
  }

  static async syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncInvestmentsFromWebhook(userId, itemId);
  }
}
