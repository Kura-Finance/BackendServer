/**
 * Plaid 投資服務
 * 處理投資持倉、資產類型與價格資料
 */

import { logDebug } from '../../logger';
import { getStockLogoUrl } from '../../shared/lib/symbolsAndExchangesUtil';
import { PlaidInvestmentPayload, PlaidInvestmentAccountPayload } from '../models/types';
import { mapPlaidInvestmentType, normalizeCryptoSymbol, isCurrencyOrUnsupported } from '../lib/plaidDataTransformer';
import ccxt from 'ccxt';
import yahooFinance from 'yahoo-finance2';

export class PlaidInvestmentService {
  /**
   * 獲取投資商品的 24h 變化百分比
   * 對於加密貨幣使用 CCXT，對於股票和 ETF 使用 yahoo-finance2
   */
  static async getInvestmentPriceChange24h(symbol: string, investmentType: 'crypto' | 'stock' | 'etf'): Promise<number> {
    try {
      // 跳過貨幣和不支持的資產類型
      if (isCurrencyOrUnsupported(symbol)) {
        logDebug(`Skipping price fetch for unsupported symbol: ${symbol}`);
        return 0;
      }

      if (investmentType === 'crypto') {
        // 使用 CCXT 獲取加密貨幣 24h 變化
        const binance = new (ccxt.binance as any)();
        const cleanedSymbol = symbol.replace(/[:\s\-]/g, '').toUpperCase();
        const ticker = await binance.fetchTicker(`${cleanedSymbol}/USDT`);
        return ticker.percentage || 0;
      } else if (investmentType === 'stock' || investmentType === 'etf') {
        // 使用 yahoo-finance2 獲取股票/ETF 24h 變化
        try {
          // 初始化 YahooFinance 實例
          const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
          const result = (await yf.quote(symbol)) as any;
          // 計算 24h 變化百分比
          if (result?.regularMarketPrice && result?.regularMarketPreviousClose) {
            const change = ((result.regularMarketPrice - result.regularMarketPreviousClose) / result.regularMarketPreviousClose) * 100;
            return parseFloat(change.toFixed(2));
          }
          return result?.regularMarketChangePercent || 0;
        } catch (error) {
          logDebug(`Failed to fetch price for ${investmentType} ${symbol}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          return 0;
        }
      }
      return 0;
    } catch (error) {
      logDebug(`Failed to fetch 24h change for ${symbol}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * 取得投資帳戶和持倉
   */
  static async fetchInvestmentHoldings(
    userPlaidClient: any,
    item: { institutionName: string },
    decryptedAccessToken: string,
  ): Promise<{ investmentAccounts: PlaidInvestmentAccountPayload[]; investments: PlaidInvestmentPayload[] }> {
    const investmentAccounts: PlaidInvestmentAccountPayload[] = [];
    const investments: PlaidInvestmentPayload[] = [];

    try {
      const holdingsResponse = await userPlaidClient.investmentsHoldingsGet({
        access_token: decryptedAccessToken,
      });

      const securitiesById = new Map(holdingsResponse.data.securities.map((security: any) => [security.security_id, security]));

      for (const account of holdingsResponse.data.accounts) {
        investmentAccounts.push({
          id: account.account_id,
          name: `${item.institutionName} · ${account.name}`,
          type: 'Broker',
          logo: '',
        });
      }

      for (const holding of holdingsResponse.data.holdings) {
        const security: any = securitiesById.get(holding.security_id);
        if (!security) continue;

        const investmentType = mapPlaidInvestmentType(security.type, security.ticker_symbol);

        // 規範化加密貨幣 symbol 用於 API 查詢
        let normalizedSymbol = security.ticker_symbol || '';
        if (investmentType === 'crypto' && security.ticker_symbol) {
          const cryptoSymbol = normalizeCryptoSymbol(security.ticker_symbol);
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
          logo: getStockLogoUrl(normalizedSymbol || ''),
        });
      }
    } catch (error: any) {
      logDebug('No investment holdings available', {
        error: error.response?.data || error.message || error,
      });
    }

    return { investmentAccounts, investments };
  }
}
