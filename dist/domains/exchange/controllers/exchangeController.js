"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportedExchanges = exports.disconnectExchange = exports.getUserExchangeAccounts = exports.getExchangeBalances = exports.connectExchange = void 0;
const exchangeService_1 = require("../services/exchangeService");
const logger_1 = require("../../logger");
/**
 * 連結交易所帳戶
 */
const connectExchange = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const { exchange, apiKey, apiSecret, passphrase } = req.body;
        if (!exchange || !apiKey || !apiSecret) {
            res.status(400).json({
                error: '缺少必要參數: exchange, apiKey, apiSecret',
            });
            return;
        }
        const account = await exchangeService_1.ExchangeService.connectExchange(req.userId, exchange.toLowerCase(), apiKey, apiSecret, passphrase);
        res.json({
            success: true,
            account: {
                accountId: account.id,
                id: account.id,
                exchange: account.exchange,
                exchangeDisplayName: account.exchangeDisplayName,
                isVerified: account.isVerified,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Connect exchange failed', error, { userId: req.userId });
        res.status(500).json({
            error: error instanceof Error ? error.message : '連接交易所失敗',
        });
    }
};
exports.connectExchange = connectExchange;
/**
 * 獲取交易所餘額和資產 (合併端點)
 * 返回簡化的 JSON 結構: { account, balances, assets, timestamp }
 */
const getExchangeBalances = async (req, res) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: '未登入' });
            return;
        }
        const exchangeAccountId = req.params.exchangeAccountId;
        if (!exchangeAccountId || exchangeAccountId === 'undefined') {
            res.status(400).json({ error: '缺少必要參數: exchangeAccountId' });
            return;
        }
        const result = await exchangeService_1.ExchangeService.getBalancesAndAssets(req.userId, exchangeAccountId);
        res.json(result);
    }
    catch (error) {
        (0, logger_1.logError)('Get exchange balances failed', error, { userId: req.userId });
        res.status(500).json({
            error: error instanceof Error ? error.message : '無法取得交易所餘額',
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
            res.status(401).json({ error: '未登入' });
            return;
        }
        const accounts = await exchangeService_1.ExchangeService.getUserExchangeAccounts(req.userId);
        res.json({
            accounts,
            metadata: {
                timestamp: new Date().toISOString(),
                count: accounts.length,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get user exchange accounts failed', error, { userId: req.userId });
        res.status(500).json({
            error: '無法取得交易所帳戶清單',
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
            res.status(401).json({ error: '未登入' });
            return;
        }
        const exchangeAccountId = req.params.exchangeAccountId;
        if (!exchangeAccountId || exchangeAccountId === 'undefined') {
            res.status(400).json({ error: '缺少必要參數: exchangeAccountId' });
            return;
        }
        const result = await exchangeService_1.ExchangeService.disconnectExchange(req.userId, exchangeAccountId);
        res.json(result);
    }
    catch (error) {
        (0, logger_1.logError)('Disconnect exchange failed', error, { userId: req.userId });
        res.status(500).json({
            error: error instanceof Error ? error.message : '斷開連接失敗',
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
        res.json({
            exchanges,
            metadata: {
                timestamp: new Date().toISOString(),
                count: exchanges.length,
                message: `支持 ${exchanges.length} 個交易所`,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Get supported exchanges failed', error);
        res.status(500).json({
            error: '無法取得支持的交易所列表',
        });
    }
};
exports.getSupportedExchanges = getSupportedExchanges;
//# sourceMappingURL=exchangeController.js.map