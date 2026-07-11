"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportedExchanges = exports.disconnectExchange = exports.getUserExchangeAccounts = exports.getExchangeBalances = exports.connectExchange = void 0;
const exchangeService_1 = require("../services/exchangeService");
const logger_1 = require("../../logger");
const symbolsAndExchangesUtil_1 = require("../../shared/lib/symbolsAndExchangesUtil");
const apiRateLimitUtil_1 = require("../../shared/lib/apiRateLimitUtil");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * 連結交易所帳戶
 * 受用戶等級限制：每天最多連接次數
 */
const connectExchange = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        // 檢查 API 操作限制
        const limitCheck = await (0, apiRateLimitUtil_1.checkApiLimit)(req.userId, 'exchange_connect');
        if (!limitCheck.canOperate) {
            (0, apiResponse_1.sendError)(res, 429, {
                code: 'RATE_LIMITED',
                message: 'Daily connect limit reached',
                details: {
                    limitMessage: limitCheck.message,
                    retryAfter: 86400,
                },
            });
            return;
        }
        const { exchange, apiKey, apiSecret, passphrase } = req.body;
        const account = await exchangeService_1.ExchangeService.connectExchange(req.userId, exchange.toLowerCase(), apiKey, apiSecret, passphrase);
        // 記錄 API 操作
        await (0, apiRateLimitUtil_1.recordApiOperation)(req.userId, 'exchange_connect');
        (0, apiResponse_1.sendSuccess)(res, {
            account: {
                accountId: account.id,
                id: account.id,
                exchange: account.exchange,
                exchangeDisplayName: account.exchangeDisplayName,
                icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(account.exchange),
                isVerified: account.isVerified,
            },
            rateLimitInfo: {
                remaining: limitCheck.operationCountRemaining - 1,
                limit: limitCheck.operationLimit,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Connect exchange failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to connect exchange account',
        });
    }
};
exports.connectExchange = connectExchange;
/**
 * 獲取交易所餘額和資產 (合併端點)
 * 達到查詢上限時返回數據庫緩存內容
 * 受用戶等級限制：每天最多查詢次數
 */
const getExchangeBalances = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        // 檢查 API 操作限制
        const limitCheck = await (0, apiRateLimitUtil_1.checkApiLimit)(req.userId, 'exchange_balance');
        const exchangeAccountId = req.params.exchangeAccountId;
        // 如果達到限制，返回緩存數據
        if (!limitCheck.canOperate) {
            try {
                const cachedResult = await exchangeService_1.ExchangeService.getBalancesAndAssetsFromCache(req.userId, exchangeAccountId);
                (0, apiResponse_1.sendSuccess)(res, {
                    ...cachedResult,
                    account: {
                        ...cachedResult.account,
                        icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(cachedResult.account.exchange),
                    },
                    rateLimitInfo: {
                        remaining: 0,
                        limit: limitCheck.operationLimit,
                        limitReached: true,
                        message: limitCheck.message,
                    },
                });
                return;
            }
            catch (cacheError) {
                // 如果無法獲取緩存數據，返回錯誤
                (0, apiResponse_1.sendError)(res, 429, {
                    code: 'RATE_LIMITED',
                    message: 'Daily balance query limit reached',
                    details: {
                        limitMessage: limitCheck.message,
                        retryAfter: 86400,
                    },
                });
                return;
            }
        }
        const result = await exchangeService_1.ExchangeService.getBalancesAndAssets(req.userId, exchangeAccountId);
        // 記錄 API 操作
        await (0, apiRateLimitUtil_1.recordApiOperation)(req.userId, 'exchange_balance');
        (0, apiResponse_1.sendSuccess)(res, {
            ...result,
            account: {
                ...result.account,
                icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(result.account.exchange),
            },
            rateLimitInfo: {
                remaining: limitCheck.operationCountRemaining - 1,
                limit: limitCheck.operationLimit,
                limitReached: false,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get exchange balances failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch exchange balances',
        });
    }
};
exports.getExchangeBalances = getExchangeBalances;
/**
 * 獲取用戶所有交易所帳戶
 */
const getUserExchangeAccounts = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const accounts = await exchangeService_1.ExchangeService.getUserExchangeAccounts(req.userId);
        const accountsWithIcon = accounts.map(account => ({
            ...account,
            icon: (0, symbolsAndExchangesUtil_1.getExchangeIcon)(account.exchange),
        }));
        (0, apiResponse_1.sendSuccess)(res, {
            accounts: accountsWithIcon,
            metadata: {
                timestamp: new Date().toISOString(),
                count: accounts.length,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get user exchange accounts failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch exchange accounts',
        });
    }
};
exports.getUserExchangeAccounts = getUserExchangeAccounts;
/**
 * 斷開交易所連接
 */
const disconnectExchange = async (req, res) => {
    try {
        if (!req.userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const exchangeAccountId = req.params.exchangeAccountId;
        const result = await exchangeService_1.ExchangeService.disconnectExchange(req.userId, exchangeAccountId);
        (0, apiResponse_1.sendSuccess)(res, result);
    }
    catch (error) {
        (0, logger_1.logError)('Disconnect exchange failed', error, { userId: req.userId });
        (0, apiResponse_1.sendError)(res, 500, {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to disconnect exchange account',
        });
    }
};
exports.disconnectExchange = disconnectExchange;
/**
 * 獲取支持的交易所列表
 */
const getSupportedExchanges = async (req, res) => {
    try {
        const exchanges = exchangeService_1.ExchangeService.getSupportedExchanges();
        (0, apiResponse_1.sendSuccess)(res, {
            exchanges,
            metadata: {
                timestamp: new Date().toISOString(),
                count: exchanges.length,
                message: `${exchanges.length} exchanges supported`,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get supported exchanges failed', error);
        (0, apiResponse_1.sendError)(res, 500, {
            code: 'INTERNAL_ERROR',
            message: 'Failed to fetch supported exchanges',
        });
    }
};
exports.getSupportedExchanges = getSupportedExchanges;
//# sourceMappingURL=exchangeController.js.map