"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeService = void 0;
const ccxt_1 = __importDefault(require("ccxt"));
const prisma_1 = require("../../shared/lib/prisma");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const symbolsAndExchangesUtil_1 = require("../../shared/lib/symbolsAndExchangesUtil");
const encryption_1 = require("../../shared/lib/encryption");
const assetService_1 = require("../../asset/services/assetService");
const crypto_1 = require("../../shared/crypto");
const payloadKeyService_1 = require("../../shared/services/payloadKeyService");
class ExchangeService {
    /**
     * 驗證交易所連接
     */
    static async verifyExchangeConnection(exchange, apiKey, apiSecret, passphrase) {
        try {
            (0, logger_1.logDebug)('Verifying exchange connection', { exchange });
            // 獲取 CCXT 交易所類
            const ExchangeClass = ccxt_1.default[exchange];
            if (!ExchangeClass) {
                return {
                    success: false,
                    error: `Unsupported exchange: ${exchange}`,
                };
            }
            // 創建交易所實例
            const exchangeInstance = new ExchangeClass({
                apiKey,
                secret: apiSecret,
                password: passphrase, // 某些交易所需要密語
                enableRateLimit: true,
            });
            // 測試連接 - 獲取交易所時間
            const timestamp = await exchangeInstance.fetchTime();
            (0, logger_1.logDebug)('Exchange verification successful', {
                exchange,
                timestamp,
            });
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            (0, logger_1.logError)('Exchange verification failed', error, { exchange });
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * 連結新的交易所帳戶
     */
    static async connectExchange(userId, exchange, apiKey, apiSecret, passphrase) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Connecting exchange account', { userId, exchange });
            // 驗證連接
            const verification = await this.verifyExchangeConnection(exchange, apiKey, apiSecret, passphrase);
            if (!verification.success) {
                throw new Error(verification.error || 'Connection failed');
            }
            // 獲取交易所顯示名稱
            const exchangeDisplayName = this.getExchangeDisplayName(exchange);
            // 加密敏感信息
            const encryptedApiKey = encryption_1.EncryptionUtil.encrypt(apiKey);
            const encryptedApiSecret = encryption_1.EncryptionUtil.encrypt(apiSecret);
            const encryptedPassphrase = passphrase ? encryption_1.EncryptionUtil.encrypt(passphrase) : null;
            // 保存到數據庫
            const account = await prisma_1.prisma.exchangeAccount.upsert({
                where: {
                    userId_exchange: {
                        userId,
                        exchange,
                    },
                },
                update: {
                    apiKey: encryptedApiKey,
                    apiSecret: encryptedApiSecret,
                    passphrase: encryptedPassphrase,
                    isActive: true,
                    isVerified: true,
                    lastVerifiedAt: new Date(),
                    verificationError: null,
                },
                create: {
                    userId,
                    exchange,
                    exchangeDisplayName,
                    apiKey: encryptedApiKey,
                    apiSecret: encryptedApiSecret,
                    passphrase: encryptedPassphrase,
                    isVerified: true,
                    lastVerifiedAt: new Date(),
                },
            });
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('exchange_account_connected', userId, {
                exchange,
                exchangeDisplayName,
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'SUCCESS', {
                exchange,
                exchangeDisplayName,
                accountId: account.id,
            }, undefined, duration);
            return {
                ...account,
                icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(account.exchange),
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Failed to connect exchange', error, { userId, exchange });
            // 記錄審計日誌（失敗）
            auditLog_1.AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'FAILURE', {
                exchange,
            }, errorMsg, duration);
            throw error;
        }
    }
    /**
     * 獲取交易所餘額
     */
    static async getExchangeBalances(userId, exchangeAccountId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Fetching exchange balances', { userId, exchangeAccountId });
            if (!exchangeAccountId || exchangeAccountId === 'undefined') {
                throw new Error('Invalid account ID');
            }
            // 從數據庫獲取帳戶信息
            const account = await prisma_1.prisma.exchangeAccount.findUnique({
                where: { id: exchangeAccountId },
            });
            if (!account || account.userId !== userId) {
                throw new Error('Account not found or access denied');
            }
            if (!account.isActive) {
                throw new Error('Account is inactive');
            }
            // 解密敏感信息
            const decryptedApiKey = encryption_1.EncryptionUtil.decrypt(account.apiKey);
            const decryptedApiSecret = encryption_1.EncryptionUtil.decrypt(account.apiSecret);
            const decryptedPassphrase = account.passphrase ? encryption_1.EncryptionUtil.decrypt(account.passphrase) : undefined;
            // 使用 CCXT 獲取餘額
            const ExchangeClass = ccxt_1.default[account.exchange];
            const exchangeInstance = new ExchangeClass({
                apiKey: decryptedApiKey,
                secret: decryptedApiSecret,
                password: decryptedPassphrase,
                enableRateLimit: true,
            });
            const balances = await exchangeInstance.fetchBalance();
            // 快取餘額數據
            await this.cacheBalances(userId, exchangeAccountId, account.exchange, balances);
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('exchange_balances_fetched', userId, {
                exchange: account.exchange,
                symbolCount: Object.keys(balances).length,
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'SUCCESS', {
                exchange: account.exchange,
                symbolCount: Object.keys(balances).length,
            }, undefined, duration);
            return {
                account: {
                    id: account.id,
                    exchange: account.exchange,
                    exchangeDisplayName: account.exchangeDisplayName,
                },
                balances,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Failed to fetch exchange balances', error, { userId, exchangeAccountId });
            // 記錄審計日誌（失敗）
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
            throw error;
        }
    }
    /**
     * 同步交易所餘額 + 資產，並回傳「加密形式」snapshot（Phase 3 Zero-Access E2EE only）。
     *
     * 後端流程：
     *   1. CCXT fetchBalance → 暫時持有明文 balances
     *   2. 透過 CCXT 取得各 symbol 的 USD 價格（純算術，不持久化）
     *   3. cacheBalances / cacheAssets 把明文 SEK 加密寫入 cache + AssetSnapshot
     *   4. 立即 zeroize SEK，從加密 cache 撈出 row 回傳（前端解密渲染）
     *
     * 注意：期貨持倉（positions）目前未做 zero-access 加密儲存（只在同步當下回傳），
     * PR 5 後 positions 不再寫入持久層；若需 zero-access 期貨歷史，需另闢儲存表。
     */
    static async getBalancesAndAssets(userId, exchangeAccountId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Fetching exchange balances and assets', {
                userId,
                exchangeAccountId,
            });
            if (!exchangeAccountId || exchangeAccountId === 'undefined') {
                throw new Error('Invalid account ID');
            }
            const account = await prisma_1.prisma.exchangeAccount.findUnique({
                where: { id: exchangeAccountId },
            });
            if (!account || account.userId !== userId) {
                throw new Error('Account not found or access denied');
            }
            if (!account.isActive) {
                throw new Error('Account is inactive');
            }
            const decryptedApiKey = encryption_1.EncryptionUtil.decrypt(account.apiKey);
            const decryptedApiSecret = encryption_1.EncryptionUtil.decrypt(account.apiSecret);
            const decryptedPassphrase = account.passphrase
                ? encryption_1.EncryptionUtil.decrypt(account.passphrase)
                : undefined;
            const ExchangeClass = ccxt_1.default[account.exchange];
            const exchangeInstance = new ExchangeClass({
                apiKey: decryptedApiKey,
                secret: decryptedApiSecret,
                password: decryptedPassphrase,
                enableRateLimit: true,
            });
            const balances = await exchangeInstance.fetchBalance();
            await this.cacheBalances(userId, exchangeAccountId, account.exchange, balances);
            const formattedBalances = Object.keys(balances)
                .filter((symbol) => {
                if (symbol === 'free' ||
                    symbol === 'used' ||
                    symbol === 'total' ||
                    symbol === 'info' ||
                    symbol === 'datetime' ||
                    symbol === 'timestamp') {
                    return false;
                }
                const balance = balances[symbol];
                return (balance &&
                    typeof balance === 'object' &&
                    typeof balance.total === 'number' &&
                    balance.total > 0);
            })
                .map((symbol) => ({
                symbol,
                free: Number(balances[symbol].free) || 0,
                used: Number(balances[symbol].used) || 0,
                total: Number(balances[symbol].total) || 0,
            }));
            const symbolsForPricing = formattedBalances.map((b) => b.symbol);
            const priceData = await this.getPrices(exchangeInstance, symbolsForPricing);
            const balancesWithUsd = formattedBalances.map((balance) => ({
                ...balance,
                usdPrice: priceData[balance.symbol]?.price || 0,
                usdValue: balance.total * (priceData[balance.symbol]?.price || 0),
            }));
            const assets = balancesWithUsd.filter((b) => b.free > 0);
            const assetsUsdTotal = assets.reduce((sum, a) => sum + a.usdValue, 0);
            await this.cacheAssets(userId, exchangeAccountId, account.exchange, assets, assetsUsdTotal);
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('exchange_balances_and_assets_fetched', userId, {
                exchange: account.exchange,
                balanceCount: balancesWithUsd.length,
                assetCount: assets.length,
                assetsUsdTotal,
            });
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCES_AND_ASSETS', userId, exchangeAccountId, 'SUCCESS', {
                exchange: account.exchange,
                balanceCount: balancesWithUsd.length,
                assetCount: assets.length,
                assetsUsdTotal: assetsUsdTotal.toFixed(2),
            }, undefined, duration);
            // 同步完成後從加密快取撈出新 row 回傳
            return this.getEncryptedBalancesAndAssets(userId, exchangeAccountId);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Failed to fetch exchange balances and assets', error, { userId, exchangeAccountId });
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCES_AND_ASSETS', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
            throw error;
        }
    }
    /**
     * 寫入交易所現貨持倉（Phase 3 Zero-Access E2EE only）。
     *
     * 1. 為這次 sync 建立一把 SEK（scope=`exchange_asset:{accountId}:{ts}`），
     *    沒 keypair 直接拋（caller 顯示「請先 setup keypair」）
     * 2. 對 {holdings, price, value, percentageOfTotal} 整包加密成 payloadCiphertext
     * 3. 同一把 SEK 加密 `cryptoSpot:exchange:{accountId}` AssetSnapshot
     * 4. finally 立即釋放 SEK
     */
    static async cacheAssets(userId, exchangeAccountId, exchange, assets, assetsUsdTotal) {
        let assetsKey;
        try {
            assetsKey = await payloadKeyService_1.PayloadKeyService.createForUser(userId, `exchange_asset:${exchangeAccountId}:${Date.now()}`);
        }
        catch (err) {
            if (err instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
                logger_1.appLogger.warn('User has no E2EE key pair — exchange asset sync skipped. ' +
                    'Client must POST /api/auth/keys/setup before syncing.', { userId, exchangeAccountId });
            }
            else {
                (0, logger_1.logError)('Failed to create exchange asset payload key', err, {
                    userId,
                    exchangeAccountId,
                });
            }
            throw err;
        }
        try {
            await prisma_1.prisma.exchangeAssetCache.deleteMany({
                where: { userId, exchangeAccountId },
            });
            if (assets.length > 0) {
                await prisma_1.prisma.exchangeAssetCache.createMany({
                    data: assets.map((asset) => {
                        const holdings = Number(asset.total) || 0;
                        const price = Number(asset.usdPrice) || 0;
                        const value = Number(asset.usdValue) || 0;
                        const percentageOfTotal = assetsUsdTotal > 0 ? (value / assetsUsdTotal) * 100 : 0;
                        return {
                            userId,
                            exchangeAccountId,
                            exchange,
                            symbol: asset.symbol,
                            payloadCiphertext: (0, crypto_1.encryptPayload)(assetsKey.sek, {
                                holdings,
                                price,
                                value,
                                percentageOfTotal,
                            }),
                            payloadKeyId: assetsKey.payloadKeyId,
                        };
                    }),
                });
            }
            // 在 SEK 還在記憶體時，把本帳戶現貨 USD 總值加密寫入 AssetSnapshot。
            // 用 sub-scoped metric "cryptoSpot:exchange:{accountId}"，
            // 前端讀取 encrypted history 後按 base "cryptoSpot" 加總（含 debank token）。
            try {
                await assetService_1.AssetService.recordSnapshotFromPlaintext(userId, {
                    [`cryptoSpot:exchange:${exchangeAccountId}`]: assetsUsdTotal,
                });
            }
            catch (err) {
                (0, logger_1.logDebug)('Failed to record encrypted cryptoSpot snapshot for exchange', {
                    userId,
                    exchangeAccountId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        finally {
            (0, crypto_1.zeroize)(assetsKey.sek);
        }
    }
    /**
     * 獲取代幣 USD 價格和 24h 變化
     * 通過 CCXT 交易所獲取最新價格信息和 24h 漲幅
     */
    static async getPrices(exchangeInstance, symbols) {
        const prices = {};
        try {
            // 批量獲取價格 (使用 USDT 對錶)
            const tickers = await Promise.all(symbols.map(async (symbol) => {
                try {
                    const pair = `${symbol}/USDT`;
                    const ticker = await exchangeInstance.fetchTicker(pair);
                    // 計算 24h 變化百分比
                    let change24h = 0;
                    if (ticker.percentage !== undefined && ticker.percentage !== null) {
                        // 優先使用 percentage 欄位（已是百分比格式）
                        change24h = ticker.percentage;
                    }
                    else if (ticker.open && ticker.close) {
                        // 若沒有 percentage，從 open 與 close 計算
                        change24h = ((ticker.close - ticker.open) / ticker.open) * 100;
                        change24h = parseFloat(change24h.toFixed(2));
                    }
                    else if (ticker.quoteVolume && ticker.baseVolume) {
                        // 備用方案：嘗試其他可用的欄位
                        (0, logger_1.logDebug)(`Limited ticker data for ${symbol}`, {
                            hasPercentage: ticker.percentage !== undefined,
                            hasOpen: ticker.open !== undefined,
                            hasClose: ticker.close !== undefined,
                        });
                    }
                    return {
                        symbol,
                        price: ticker.last || ticker.close || 0,
                        change24h,
                    };
                }
                catch (err) {
                    // 某個幣對獲取失敗,返回 0
                    (0, logger_1.logDebug)(`Failed to fetch price for ${symbol}`, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                    return { symbol, price: 0, change24h: 0 };
                }
            }));
            tickers.forEach(({ symbol, price, change24h }) => {
                prices[symbol] = { price, change24h };
            });
            (0, logger_1.logDebug)('Fetched prices', {
                symbolCount: symbols.length,
                priceCount: Object.keys(prices).length,
            });
            return prices;
        }
        catch (error) {
            (0, logger_1.logDebug)('Failed to fetch prices', {
                error: error instanceof Error ? error.message : String(error),
            });
            return prices;
        }
    }
    // getPositions（期貨合約持倉）已於 PR 5 移除：zero-access 模式下需另設加密表，
    // 否則明文 positions 不能持久化。目前 sync 流程不再回傳 positions，
    // 等未來 PR 補上 zero-access positions table 後再恢復。
    /**
     * 快取餘額數據（Phase 3 Zero-Access E2EE only）。
     *
     * 取得 SEK（scope=`exchange_balance:{accountId}:{ts}`），對 {free,used,total} 整包加密。
     * 沒 keypair → 拋（caller 顯示「請先 setup keypair」）。
     */
    static async cacheBalances(userId, exchangeAccountId, exchange, balances) {
        let balancesKey;
        try {
            balancesKey = await payloadKeyService_1.PayloadKeyService.createForUser(userId, `exchange_balance:${exchangeAccountId}:${Date.now()}`);
        }
        catch (err) {
            if (err instanceof payloadKeyService_1.KeyPairNotConfiguredError) {
                logger_1.appLogger.warn('User has no E2EE key pair — exchange balance sync skipped. ' +
                    'Client must POST /api/auth/keys/setup before syncing.', { userId, exchangeAccountId });
            }
            else {
                (0, logger_1.logError)('Failed to create exchange balance payload key', err, {
                    userId,
                    exchangeAccountId,
                });
            }
            throw err;
        }
        try {
            const operations = [];
            for (const symbol in balances) {
                if (symbol === 'free' ||
                    symbol === 'used' ||
                    symbol === 'total' ||
                    symbol === 'info' ||
                    symbol === 'datetime' ||
                    symbol === 'timestamp') {
                    continue;
                }
                const balance = balances[symbol];
                if (!balance || typeof balance !== 'object') {
                    (0, logger_1.logDebug)('Skipping invalid balance entry', { symbol, balanceType: typeof balance });
                    continue;
                }
                const free = Number(balance.free) || 0;
                const used = Number(balance.used) || 0;
                const total = Number(balance.total) || 0;
                if (total > 0) {
                    const payloadCiphertext = (0, crypto_1.encryptPayload)(balancesKey.sek, { free, used, total });
                    const payloadKeyId = balancesKey.payloadKeyId;
                    operations.push(prisma_1.prisma.exchangeBalanceCache.upsert({
                        where: {
                            userId_exchangeAccountId_symbol: {
                                userId,
                                exchangeAccountId,
                                symbol,
                            },
                        },
                        update: {
                            payloadCiphertext,
                            payloadKeyId,
                            updatedAt: new Date(),
                        },
                        create: {
                            userId,
                            exchangeAccountId,
                            exchange,
                            symbol,
                            payloadCiphertext,
                            payloadKeyId,
                        },
                    }));
                }
            }
            if (operations.length > 0) {
                await Promise.all(operations);
            }
            await prisma_1.prisma.exchangeSyncLog.upsert({
                where: { userId },
                update: {
                    balancesSyncedAt: new Date(),
                },
                create: {
                    userId,
                    balancesSyncedAt: new Date(),
                },
            });
        }
        finally {
            (0, crypto_1.zeroize)(balancesKey.sek);
        }
    }
    /**
     * Phase 3 Zero-Access E2EE：取得交易所「加密形式」餘額 + 資產快照。
     *
     * - 後端只 select metadata + payloadCiphertext + payloadKeyId，不解密
     * - 額外回傳 payloadKeys（去重後的 wrappedSek 清單）
     * - 沒有 payloadCiphertext 的 legacy row 會被跳過
     */
    static async getEncryptedBalancesAndAssets(userId, exchangeAccountId) {
        if (!exchangeAccountId || exchangeAccountId === 'undefined') {
            throw new Error('Invalid account ID');
        }
        const account = await prisma_1.prisma.exchangeAccount.findUnique({
            where: { id: exchangeAccountId },
            select: {
                id: true,
                userId: true,
                exchange: true,
                exchangeDisplayName: true,
            },
        });
        if (!account || account.userId !== userId) {
            throw new Error('Account not found or access denied');
        }
        const [balanceRows, assetRows] = await Promise.all([
            prisma_1.prisma.exchangeBalanceCache.findMany({
                where: {
                    userId,
                    exchangeAccountId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    symbol: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { cachedAt: 'desc' },
            }),
            prisma_1.prisma.exchangeAssetCache.findMany({
                where: {
                    userId,
                    exchangeAccountId,
                    NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
                },
                select: {
                    symbol: true,
                    cachedAt: true,
                    payloadCiphertext: true,
                    payloadKeyId: true,
                },
                orderBy: { cachedAt: 'desc' },
            }),
        ]);
        const balances = balanceRows
            .filter((r) => r.payloadCiphertext && r.payloadKeyId)
            .map((r) => ({
            symbol: r.symbol,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const assets = assetRows
            .filter((r) => r.payloadCiphertext && r.payloadKeyId)
            .map((r) => ({
            symbol: r.symbol,
            cachedAt: r.cachedAt,
            payloadCiphertext: r.payloadCiphertext,
            payloadKeyId: r.payloadKeyId,
        }));
        const payloadKeyIds = Array.from(new Set([...balances.map((b) => b.payloadKeyId), ...assets.map((a) => a.payloadKeyId)]));
        const payloadKeys = await payloadKeyService_1.PayloadKeyService.getForRead(userId, payloadKeyIds);
        return {
            account: {
                id: account.id,
                exchange: account.exchange,
                displayName: account.exchangeDisplayName,
            },
            payloadKeys,
            balances,
            assets,
        };
    }
    /**
     * 獲取所有支持的交易所列表
     */
    static getSupportedExchanges() {
        return symbolsAndExchangesUtil_1.KURA_SUPPORTED_EXCHANGES;
    }
    /**
     * 獲取交易所顯示名稱
     */
    static getExchangeDisplayName(exchange) {
        return symbolsAndExchangesUtil_1.EXCHANGE_DISPLAY_MAP[exchange] || exchange.toUpperCase();
    }
    /**
     * 斷開交易所連接
     */
    static async disconnectExchange(userId, exchangeAccountId) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Disconnecting exchange account', { userId, exchangeAccountId });
            if (!exchangeAccountId || exchangeAccountId === 'undefined') {
                throw new Error('Invalid account ID');
            }
            const account = await prisma_1.prisma.exchangeAccount.findUnique({
                where: { id: exchangeAccountId },
            });
            if (!account || account.userId !== userId) {
                throw new Error('Account not found or access denied');
            }
            // 刪除帳戶及其相關快取
            await Promise.all([
                prisma_1.prisma.exchangeAccount.delete({
                    where: { id: exchangeAccountId },
                }),
                prisma_1.prisma.exchangeBalanceCache.deleteMany({
                    where: {
                        userId,
                        exchangeAccountId,
                    },
                }),
                prisma_1.prisma.exchangeAssetCache.deleteMany({
                    where: {
                        userId,
                        exchangeAccountId,
                    },
                }),
            ]);
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('exchange_account_disconnected', userId, {
                exchange: account.exchange,
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'SUCCESS', {
                exchange: account.exchange,
            }, undefined, duration);
            return { success: true };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Failed to disconnect exchange', error, { userId, exchangeAccountId });
            // 記錄審計日誌（失敗）
            auditLog_1.AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
            throw error;
        }
    }
    /**
     * 獲取用戶連接的所有交易所帳戶
     */
    static async getUserExchangeAccounts(userId) {
        const accounts = await prisma_1.prisma.exchangeAccount.findMany({
            where: { userId },
            select: {
                id: true,
                exchange: true,
                exchangeDisplayName: true,
                isActive: true,
                isVerified: true,
                lastVerifiedAt: true,
                createdAt: true,
            },
        });
        // 為每個帳戶加入 icon 欄位
        return accounts.map(account => ({
            ...account,
            icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(account.exchange),
        }));
    }
}
exports.ExchangeService = ExchangeService;
//# sourceMappingURL=exchangeService.js.map