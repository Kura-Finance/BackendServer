"use strict";
/**
 * Plaid 服務 - 外觀層
 * 負責協調專職 Plaid 服務並維持向後相容
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidService = void 0;
const plaidAuthService_1 = require("./plaidAuthService");
const plaidAccountService_1 = require("./plaidAccountService");
const plaidCacheService_1 = require("./plaidCacheService");
const plaidWebhookSyncService_1 = require("./plaidWebhookSyncService");
const demoService_1 = require("../../demo/demoService");
/**
 * 統一的 Plaid 服務門面（Phase 3 Zero-Access E2EE only）。
 *
 * 所有對外 API 都回傳「加密形式」snapshot：後端永不解密 sensitive payload，
 * 前端用 X25519 privateKey unwrap payloadKeys 後解每個 row 的 ciphertext。
 */
class PlaidService {
    // ===== 驗證 =====
    static async createLinkToken(userId) {
        return plaidAuthService_1.PlaidAuthService.createLinkToken(userId);
    }
    static async exchangePublicToken(userId, publicToken, institutionName) {
        return plaidAuthService_1.PlaidAuthService.exchangePublicToken(userId, publicToken, institutionName);
    }
    // ===== 帳戶管理 =====
    static async disconnectItemByAccountId(userId, accountId) {
        return plaidAccountService_1.PlaidAccountService.disconnectItemByAccountId(userId, accountId);
    }
    // ===== 快取與同步（全部加密形式）=====
    /**
     * 優化版：快取未過期 → 直接讀加密 row；過期或手動刷新 → 從 Plaid API 抓 → 加密寫入 → 回讀加密 row。
     */
    static async getFinanceSnapshotOptimized(userId, isManualRefresh = false) {
        if (await demoService_1.DemoService.isDemoUser(userId)) {
            return demoService_1.DemoService.plaidSnapshot(userId);
        }
        return plaidCacheService_1.PlaidCacheService.getFinanceSnapshotOptimized(userId, isManualRefresh);
    }
    /**
     * 僅讀快取（不觸發 Plaid API）：回傳目前 cache 中的加密形式 snapshot。
     */
    static async getEncryptedFinanceSnapshot(userId) {
        if (await demoService_1.DemoService.isDemoUser(userId)) {
            return demoService_1.DemoService.plaidSnapshot(userId);
        }
        return plaidCacheService_1.PlaidCacheService.getEncryptedSnapshotFromCache(userId);
    }
    // ===== Webhook 同步 =====
    static async syncTransactionsFromWebhook(userId, itemId) {
        return plaidWebhookSyncService_1.PlaidWebhookSyncService.syncTransactionsFromWebhook(userId, itemId);
    }
    static async syncInvestmentsFromWebhook(userId, itemId) {
        return plaidWebhookSyncService_1.PlaidWebhookSyncService.syncInvestmentsFromWebhook(userId, itemId);
    }
}
exports.PlaidService = PlaidService;
//# sourceMappingURL=plaidService.js.map