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
/**
 * 交易所服務 - CCXT 整合層
 * 支持全球 100+ 加密貨幣交易所
 */
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
     * 合併獲取交易所餘額和資產 (現貨持倉)
     * 返回簡化的 JSON 結構，便於前端使用和未來擴展
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
            const decryptedPassphrase = account.passphrase
                ? encryption_1.EncryptionUtil.decrypt(account.passphrase)
                : undefined;
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
            // 獲取期貨合約持倉 (非同步,不阻塞主流程)
            const positions = await this.getPositions(userId, exchangeInstance, account.exchange, exchangeAccountId);
            // 格式化餘額資料 balances - 只回傳有餘額的幣種
            const formattedBalances = Object.keys(balances)
                .filter(symbol => {
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
                .map(symbol => ({
                symbol,
                free: Number(balances[symbol].free) || 0,
                used: Number(balances[symbol].used) || 0,
                total: Number(balances[symbol].total) || 0,
            }));
            // 獲取所有幣種的 USD 價格和 24h 變化
            const symbolsForPricing = formattedBalances.map(b => b.symbol);
            const priceData = await this.getPrices(exchangeInstance, symbolsForPricing);
            // 將 USD 價值與 24h 變化加入 balances
            const balancesWithUsd = formattedBalances.map(balance => ({
                ...balance,
                logo: (0, symbolsAndExchangesUtil_1.getStockLogoUrl)(balance.symbol),
                usdPrice: priceData[balance.symbol]?.price || 0,
                change24h: priceData[balance.symbol]?.change24h || 0,
                usdValue: balance.total * (priceData[balance.symbol]?.price || 0),
            }));
            // 篩選出有自由餘額的資產 (現貨持倉)
            const assets = balancesWithUsd.filter(b => b.free > 0);
            // 計算 USD 總值
            const balancesUsdTotal = balancesWithUsd.reduce((sum, b) => sum + b.usdValue, 0);
            const assetsUsdTotal = assets.reduce((sum, a) => sum + a.usdValue, 0);
            // 將 USD 價值加入 positions
            // 取出 positions 中的基礎幣種以取得 24h 變化
            const positionSymbols = positions.map((pos) => pos.symbol.split('/')[0]); // 從 BTC/USDT 提取 BTC
            const positionPriceData = await this.getPrices(exchangeInstance, [...new Set(positionSymbols)]);
            const positionsWithChange = positions.map((pos) => {
                const baseSymbol = pos.symbol.split('/')[0];
                return {
                    ...pos,
                    logo: (0, symbolsAndExchangesUtil_1.getStockLogoUrl)(baseSymbol),
                    change24h: positionPriceData[baseSymbol]?.change24h || 0,
                    usdValue: pos.contracts * pos.contractSize * pos.markPrice,
                };
            });
            const positionsUsdTotal = positionsWithChange.reduce((sum, p) => sum + p.usdValue, 0);
            const duration = Date.now() - startTime;
            (0, logger_1.logBusinessEvent)('exchange_balances_and_assets_fetched', userId, {
                exchange: account.exchange,
                balanceCount: balancesWithUsd.length,
                assetCount: assets.length,
                positionCount: positionsWithChange.length,
                balancesUsdTotal,
                assetsUsdTotal,
                positionsUsdTotal,
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCES_AND_ASSETS', userId, exchangeAccountId, 'SUCCESS', {
                exchange: account.exchange,
                balanceCount: balancesWithUsd.length,
                assetCount: assets.length,
                positionCount: positionsWithChange.length,
                balancesUsdTotal: balancesUsdTotal.toFixed(2),
                assetsUsdTotal: assetsUsdTotal.toFixed(2),
                positionsUsdTotal: positionsUsdTotal.toFixed(2),
            }, undefined, duration);
            return {
                account: {
                    id: account.id,
                    exchange: account.exchange,
                    displayName: account.exchangeDisplayName,
                },
                balances: balancesWithUsd,
                balancesUsdTotal,
                assets,
                assetsUsdTotal,
                positions: positionsWithChange,
                positionsUsdTotal,
                totalUsdValue: balancesUsdTotal + positionsUsdTotal,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            (0, logger_1.logError)('Failed to fetch exchange balances and assets', error, { userId, exchangeAccountId });
            // 記錄審計日誌（失敗）
            auditLog_1.AuditLogger.logExchangeOperation('FETCH_BALANCES_AND_ASSETS', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
            throw error;
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
    /**
     * 獲取期貨合約持倉
     * 支持 CCXT 交易所的合約持倉數據
     */
    static async getPositions(userId, exchangeInstance, exchange, exchangeAccountId) {
        try {
            // 檢查交易所是否支持合約
            if (!exchangeInstance.has.fetchPositions) {
                (0, logger_1.logDebug)('Exchange does not support positions', { exchange });
                return [];
            }
            const positions = await exchangeInstance.fetchPositions();
            // 篩選出開倉的持仓 (合約數量 > 0)
            const openPositions = positions
                .filter((pos) => pos.contracts > 0 || pos.contractSize > 0)
                .map((pos) => ({
                symbol: pos.symbol,
                contractType: pos.type || 'linear', // linear 或 inverse
                contracts: Number(pos.contracts) || 0,
                contractSize: Number(pos.contractSize) || 0,
                currentPrice: Number(pos.currentPrice) || 0,
                markPrice: Number(pos.markPrice) || 0,
                percentage: Number(pos.percentage) || 0, // 本金百分比營利
                maintenanceMargin: Number(pos.maintenanceMargin) || 0,
                collateral: Number(pos.collateral) || 0,
                initialMargin: Number(pos.initialMargin) || 0,
                unrealizedPnl: Number(pos.unrealizedPnl) || 0,
                realizedPnl: Number(pos.realizedPnl) || 0,
                leverage: Number(pos.leverage) || 1,
                side: pos.side, // 'long' 或 'short'
                info: pos.info,
            }));
            (0, logger_1.logDebug)('Fetched positions', {
                exchange,
                positionCount: openPositions.length,
            });
            return openPositions;
        }
        catch (error) {
            (0, logger_1.logDebug)('Failed to fetch positions', { exchange, error: error instanceof Error ? error.message : String(error) });
            // 不中斷主流程 - 如果合約獲取失敗,仍返回空陣列
            return [];
        }
    }
    /**
     * 快取餘額數據
     */
    static async cacheBalances(userId, exchangeAccountId, exchange, balances) {
        try {
            const operations = [];
            for (const symbol in balances) {
                // 排除 CCXT 的元數據字段和無效項
                if (symbol === 'free' || symbol === 'used' || symbol === 'total' || symbol === 'info' || symbol === 'datetime' || symbol === 'timestamp') {
                    continue;
                }
                const balance = balances[symbol];
                // 檢查餘額對象有效性
                if (!balance || typeof balance !== 'object') {
                    (0, logger_1.logDebug)('Skipping invalid balance entry', { symbol, balanceType: typeof balance });
                    continue;
                }
                const free = Number(balance.free) || 0;
                const used = Number(balance.used) || 0;
                const total = Number(balance.total) || 0;
                // 只快取有餘額的幣種
                if (total > 0) {
                    operations.push(prisma_1.prisma.exchangeBalanceCache.upsert({
                        where: {
                            userId_exchangeAccountId_symbol: {
                                userId,
                                exchangeAccountId,
                                symbol,
                            },
                        },
                        update: {
                            free,
                            used,
                            total,
                            updatedAt: new Date(),
                        },
                        create: {
                            userId,
                            exchangeAccountId,
                            exchange,
                            symbol,
                            free,
                            used,
                            total,
                        },
                    }));
                }
            }
            if (operations.length > 0) {
                await Promise.all(operations);
            }
            // 更新同步日誌
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
        catch (error) {
            (0, logger_1.logError)('Failed to cache balances', error, { userId, exchangeAccountId });
        }
    }
    /**
     * 從緩存中獲取交易所餘額和資產
     * 用於達到 API 限制時返回最後一次成功同步的數據
     */
    static async getBalancesAndAssetsFromCache(userId, exchangeAccountId) {
        try {
            (0, logger_1.logDebug)('Fetching exchange balances and assets from cache', {
                userId,
                exchangeAccountId,
            });
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
            // 從緩存獲取餘額
            const cachedBalances = await prisma_1.prisma.exchangeBalanceCache.findMany({
                where: {
                    userId,
                    exchangeAccountId,
                },
            });
            if (!cachedBalances || cachedBalances.length === 0) {
                (0, logger_1.logDebug)('No cached balances found', { userId, exchangeAccountId });
                throw new Error('No cached data available. Please run a manual sync first.');
            }
            // 格式化緩存數據
            const balancesWithUsd = cachedBalances.map(balance => ({
                symbol: balance.symbol,
                logo: (0, symbolsAndExchangesUtil_1.getStockLogoUrl)(balance.symbol),
                free: Number(balance.free) || 0,
                used: Number(balance.used) || 0,
                total: Number(balance.total) || 0,
                usdPrice: 0, // 緩存數據不包含實時價格
                change24h: 0,
                usdValue: 0,
            }));
            // 篩選出有自由餘額的資產
            const assets = balancesWithUsd.filter(b => b.free > 0);
            // 計算 USD 總值（無法計算，因為沒有實時價格）
            const balancesUsdTotal = 0;
            const assetsUsdTotal = 0;
            // 獲取同步時間戳
            const syncLog = await prisma_1.prisma.exchangeSyncLog.findUnique({
                where: { userId },
            });
            return {
                account: {
                    id: account.id,
                    exchange: account.exchange,
                    displayName: account.exchangeDisplayName,
                    icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(account.exchange),
                },
                balances: balancesWithUsd,
                balancesUsdTotal,
                assets,
                assetsUsdTotal,
                positions: [],
                positionsUsdTotal: 0,
                totalUsdValue: 0,
                timestamp: syncLog?.balancesSyncedAt?.toISOString() || new Date().toISOString(),
                fromCache: true,
                cacheNotice: 'Daily query limit reached. Showing last synced data (without real-time prices).',
            };
        }
        catch (error) {
            (0, logger_1.logError)('Failed to fetch exchange balances and assets from cache', error, { userId, exchangeAccountId });
            throw error;
        }
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