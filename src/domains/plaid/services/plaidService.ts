/**
 * Plaid service facade — coordinates auth, accounts, cache, and webhook sync.
 * Phase 3 Zero-Access E2EE only: public APIs return encrypted snapshots;
 * backend never decrypts sensitive payloads. Client unwraps payloadKeys with
 * X25519 privateKey, then decrypts each row ciphertext.
 */

import { PlaidAuthService } from './plaidAuthService';
import { PlaidAccountService } from './plaidAccountService';
import { PlaidCacheService, EncryptedFinanceSnapshot } from './plaidCacheService';
import { PlaidWebhookSyncService } from './plaidWebhookSyncService';
import { DemoService } from '../../demo/demoService';

export class PlaidService {
  // ===== Auth =====
  static async createLinkToken(userId: string): Promise<string> {
    return PlaidAuthService.createLinkToken(userId);
  }

  static async exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void> {
    return PlaidAuthService.exchangePublicToken(userId, publicToken, institutionName);
  }

  // ===== Account management =====
  static async disconnectItemByAccountId(
    userId: string,
    accountId: string
  ): Promise<{ plaidRequestId?: string; accountId: string; disconnectedItemId?: string; institution?: string }> {
    return PlaidAccountService.disconnectItemByAccountId(userId, accountId);
  }

  // ===== Cache & sync (all encrypted) =====
  /**
   * Optimized read: fresh cache → encrypted rows; stale or manual refresh →
   * fetch from Plaid → encrypt → re-read encrypted rows.
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
   * Encrypted finance snapshot: serve cache when fresh; otherwise refresh from
   * Plaid and write AssetSnapshot history.
   *
   * Mobile only hits `/finance-snapshot/encrypted`. If this path only read
   * cache and never called `saveFinanceSnapshotToCache`, Broker asset history
   * would stay empty ("No performance data yet") — webhooks that update
   * holdings also do not write AssetSnapshot.
   */
  static async getEncryptedFinanceSnapshot(userId: string): Promise<EncryptedFinanceSnapshot> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.plaidSnapshot(userId);
    }
    await PlaidCacheService.ensureInvestmentHistorySeeded(userId);
    return PlaidCacheService.getFinanceSnapshotOptimized(userId, false);
  }

  // ===== Webhook sync =====
  static async syncTransactionsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncTransactionsFromWebhook(userId, itemId);
  }

  static async syncInvestmentsFromWebhook(userId: string, itemId: string): Promise<void> {
    return PlaidWebhookSyncService.syncInvestmentsFromWebhook(userId, itemId);
  }
}
