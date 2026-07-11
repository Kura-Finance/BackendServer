"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetService = void 0;
const prisma_1 = require("../../shared/lib/prisma");
const crypto_1 = require("../../shared/crypto");
const payloadKeyService_1 = require("../../shared/services/payloadKeyService");
const logger_1 = require("../../logger");
class AssetService {
    /**
     * 取得用戶所有 snapshot 的 recordedAt（去重排序，metadata only）。
     * 不解密 payload，純粹給前端做日期選擇器。
     */
    static async getRecordDates(userId) {
        const snapshots = await prisma_1.prisma.assetSnapshot.findMany({
            where: { userId },
            distinct: ['recordedAt'],
            select: { recordedAt: true },
            orderBy: { recordedAt: 'desc' },
        });
        return snapshots.map((s) => s.recordedAt);
    }
    // ═════════════════════════════════════════════════════════════════
    // Phase 3 Zero-Access E2EE — per-metric 加密快照
    // ═════════════════════════════════════════════════════════════════
    /**
     * 把已知明文的 metric 寫成加密 AssetSnapshot row（每個 metric 一個 row）。
     *
     * 設計理念：呼叫者通常是某個 sync 流程（PlaidCacheService / ExchangeService /
     * DeBankService），它在 sync 過程中**還持有明文**，把要寫的 metric 直接傳進來。
     * 後端就在這唯一短暫持有明文的瞬間做加密，立刻 zeroize SEK，永久失去解密能力。
     *
     * 使用範例（PlaidCacheService 內）：
     *   await AssetService.recordSnapshotFromPlaintext(userId, {
     *     cashFlow: bankingValue,           // 從 snapshot.accounts 算出
     *     plaidInvestment: plaidInvValue,   // 從 snapshot.investments 算出
     *   });
     *
     * 若使用者尚未 setup keypair：graceful degrade，記 warning 後直接 return。
     * 由於 PR 5 已移除 legacy snapshot 寫入路徑，此情況下不會有資產歷史資料；
     * 必須先呼叫 `POST /api/auth/keys/setup`。
     */
    static async recordSnapshotFromPlaintext(userId, metrics, recordedAt = new Date()) {
        const entries = [];
        for (const [metric, value] of Object.entries(metrics)) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                continue;
            entries.push([metric, value]);
        }
        if (entries.length === 0) {
            return;
        }
        let payloadKey;
        try {
            payloadKey = await payloadKeyService_1.PayloadKeyService.createForUser(userId, `asset_snapshot:${userId}:${recordedAt.getTime()}`);
        }
        catch (error) {
            if (error instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
                // Pre-Phase-3 users that haven't yet called /api/auth/keys/setup —
                // gracefully skip snapshot creation. The Plaid sync caller treats
                // missing keypair as a soft failure for asset history.
                logger_1.appLogger.warn('User has no E2EE key pair — skipping encrypted asset snapshot', { userId, metrics: entries.map(([k]) => k) });
                return;
            }
            // Anything else (DB outage, constraint error, crypto fault) is a real
            // bug — surface it so the caller can decide whether to roll back the
            // surrounding sync rather than silently dropping asset history.
            (0, logger_1.logError)('Failed to create payload key for asset snapshot', error, { userId });
            throw error;
        }
        try {
            const rows = entries.map(([metric, value]) => ({
                userId,
                metric,
                recordedAt,
                payloadCiphertext: (0, crypto_1.encryptPayload)(payloadKey.sek, { value }),
                payloadKeyId: payloadKey.payloadKeyId,
            }));
            await prisma_1.prisma.assetSnapshot.createMany({ data: rows });
            (0, logger_1.logDebug)('Recorded encrypted asset snapshot', {
                userId,
                metrics: entries.map(([k]) => k),
                recordedAt,
            });
        }
        finally {
            (0, crypto_1.zeroize)(payloadKey.sek);
        }
    }
    /**
     * 用「Plaid snapshot」直接算出 cashFlow + plaidInvestment 兩個 metric 的明文。
     *
     * 給 PlaidCacheService.saveFinanceSnapshotToCache 在 SEK 還在記憶體時呼叫。
     * 不讀任何快取，純函式。
     */
    static computePlaidMetricsFromSnapshot(snapshot) {
        const cashFlow = snapshot.accounts.reduce((sum, account) => {
            const normalizedType = String(account.type || '').toLowerCase();
            const balance = Number(account.balance || 0);
            return sum + (normalizedType === 'credit' ? -Math.abs(balance) : balance);
        }, 0);
        const plaidInvestment = snapshot.investments.reduce((sum, inv) => {
            const holdings = Number(inv.holdings || 0);
            const price = Number(inv.currentPrice || 0);
            return sum + holdings * price;
        }, 0);
        return { cashFlow, plaidInvestment };
    }
    /**
     * 取得某段時間內的加密 AssetSnapshot rows + 對應的 wrappedSek。
     *
     * 後端不解密，前端用 privateKey unwrap 後在客戶端組成 4-metric 時間序列。
     *
     * 前端聚合規則：
     *   - metric 字串：可能是 base("cashFlow") 或 sub-scoped("cryptoSpot:exchange:acct-123")
     *   - 同 sub-scoped key 在同一天若有多筆 row，取 recordedAt 最大者（去掉重複 sync）
     *   - 同 base、不同 sub-scope 的值要加總（cryptoSpot 跨 exchange + debank、defiProtocol 跨地址）
     */
    static async getEncryptedAssetHistory(userId, days = 30) {
        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - days + 1);
        startDate.setUTCHours(0, 0, 0, 0);
        const rows = await prisma_1.prisma.assetSnapshot.findMany({
            where: {
                userId,
                recordedAt: { gte: startDate },
            },
            select: {
                id: true,
                metric: true,
                recordedAt: true,
                payloadCiphertext: true,
                payloadKeyId: true,
            },
            orderBy: { recordedAt: 'asc' },
        });
        const snapshots = rows.map((r) => ({
            id: r.id,
            metric: r.metric,
            recordedAt: r.recordedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const payloadKeyIds = Array.from(new Set(snapshots.map((s) => s.payloadKeyId)));
        const payloadKeys = await payloadKeyService_1.PayloadKeyService.getForRead(userId, payloadKeyIds);
        return {
            userId,
            payloadKeys,
            snapshots,
        };
    }
}
exports.AssetService = AssetService;
//# sourceMappingURL=assetService.js.map