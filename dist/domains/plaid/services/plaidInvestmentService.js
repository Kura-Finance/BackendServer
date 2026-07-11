"use strict";
/**
 * Plaid 投資服務
 * 處理投資持倉、資產類型與價格資料
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaidInvestmentService = void 0;
const logger_1 = require("../../logger");
const symbolsAndExchangesUtil_1 = require("../../shared/lib/symbolsAndExchangesUtil");
const plaidDataTransformer_1 = require("../lib/plaidDataTransformer");
const ccxt_1 = __importDefault(require("ccxt"));
const yahoo_finance2_1 = __importDefault(require("yahoo-finance2"));
class PlaidInvestmentService {
    /**
     * 獲取投資商品的 24h 變化百分比
     * 對於加密貨幣使用 CCXT，對於股票和 ETF 使用 yahoo-finance2
     */
    static async getInvestmentPriceChange24h(symbol, investmentType) {
        try {
            // 跳過貨幣和不支持的資產類型
            if ((0, plaidDataTransformer_1.isCurrencyOrUnsupported)(symbol)) {
                (0, logger_1.logDebug)(`Skipping price fetch for unsupported symbol: ${symbol}`);
                return 0;
            }
            if (investmentType === 'crypto') {
                // 使用 CCXT 獲取加密貨幣 24h 變化
                const binance = new ccxt_1.default.binance();
                const cleanedSymbol = symbol.replace(/[:\s\-]/g, '').toUpperCase();
                const ticker = await binance.fetchTicker(`${cleanedSymbol}/USDT`);
                return ticker.percentage || 0;
            }
            else if (investmentType === 'stock' || investmentType === 'etf') {
                // 使用 yahoo-finance2 獲取股票/ETF 24h 變化
                try {
                    // 初始化 YahooFinance 實例
                    const yf = new yahoo_finance2_1.default({ suppressNotices: ['yahooSurvey'] });
                    const result = (await yf.quote(symbol));
                    // 計算 24h 變化百分比
                    if (result?.regularMarketPrice && result?.regularMarketPreviousClose) {
                        const change = ((result.regularMarketPrice - result.regularMarketPreviousClose) / result.regularMarketPreviousClose) * 100;
                        return parseFloat(change.toFixed(2));
                    }
                    return result?.regularMarketChangePercent || 0;
                }
                catch (error) {
                    (0, logger_1.logDebug)(`Failed to fetch price for ${investmentType} ${symbol}`, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return 0;
                }
            }
            return 0;
        }
        catch (error) {
            (0, logger_1.logDebug)(`Failed to fetch 24h change for ${symbol}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
    /**
     * 取得投資帳戶和持倉
     */
    static async fetchInvestmentHoldings(userPlaidClient, item, decryptedAccessToken) {
        const investmentAccounts = [];
        const investments = [];
        try {
            const holdingsResponse = await userPlaidClient.investmentsHoldingsGet({
                access_token: decryptedAccessToken,
            });
            const securitiesById = new Map(holdingsResponse.data.securities.map((security) => [security.security_id, security]));
            for (const account of holdingsResponse.data.accounts) {
                investmentAccounts.push({
                    id: account.account_id,
                    name: `${item.institutionName} · ${account.name}`,
                    type: 'Broker',
                    logo: '',
                });
            }
            for (const holding of holdingsResponse.data.holdings) {
                const security = securitiesById.get(holding.security_id);
                if (!security)
                    continue;
                const investmentType = (0, plaidDataTransformer_1.mapPlaidInvestmentType)(security.type, security.ticker_symbol);
                // 規範化加密貨幣 symbol 用於 API 查詢
                let normalizedSymbol = security.ticker_symbol || '';
                if (investmentType === 'crypto' && security.ticker_symbol) {
                    const cryptoSymbol = (0, plaidDataTransformer_1.normalizeCryptoSymbol)(security.ticker_symbol);
                    if (cryptoSymbol) {
                        normalizedSymbol = cryptoSymbol;
                    }
                }
                const change24h = await this.getInvestmentPriceChange24h(normalizedSymbol, investmentType);
                investments.push({
                    id: `${holding.account_id}-${holding.security_id}`,
                    accountId: holding.account_id,
                    symbol: normalizedSymbol || security.name || 'N/A',
                    name: security.name || normalizedSymbol || 'Unknown Asset',
                    holdings: Number(holding.quantity || 0),
                    currentPrice: Number(holding.institution_price || 0),
                    change24h,
                    type: investmentType,
                    logo: (0, symbolsAndExchangesUtil_1.getStockLogoUrl)(normalizedSymbol || ''),
                });
            }
        }
        catch (error) {
            (0, logger_1.logDebug)('No investment holdings available', {
                error: error.response?.data || error.message || error,
            });
        }
        return { investmentAccounts, investments };
    }
}
exports.PlaidInvestmentService = PlaidInvestmentService;
//# sourceMappingURL=plaidInvestmentService.js.map