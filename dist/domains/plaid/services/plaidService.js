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
/**
 * 統一的 Plaid 服務門面
 * 提供簡潔的公開 API，內部委託給專門服務
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
    // ===== 快取與同步 =====
    static async getFinanceSnapshotOptimized(userId, isManualRefresh = false) {
        return plaidCacheService_1.PlaidCacheService.getFinanceSnapshotOptimized(userId, isManualRefresh);
    }
    static async getFinanceSnapshot(userId) {
        return plaidCacheService_1.PlaidCacheService.getFinanceSnapshot(userId);
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