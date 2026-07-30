/**
 * Plaid investment service — holdings, asset types, and 24h price changes.
 */

import { logDebug } from '../../logger';
import { getStockLogoUrl, getInstitutionLogoUrl } from '../../shared/lib/symbolsAndExchangesUtil';
import { PlaidInvestmentPayload, PlaidInvestmentAccountPayload } from '../models/types';
import {
  classifyPlaidAccountBucket,
  mapPlaidInvestmentType,
  normalizeCryptoSymbol,
  isCurrencyOrUnsupported,
} from '../lib/plaidDataTransformer';
import ccxt from 'ccxt';
import yahooFinance from 'yahoo-finance2';

export class PlaidInvestmentService {
  /**
   * 24h change percent: CCXT for crypto, yahoo-finance2 for stock/ETF.
   */
  static async getInvestmentPriceChange24h(symbol: string, investmentType: 'crypto' | 'stock' | 'etf'): Promise<number> {
    try {
      if (isCurrencyOrUnsupported(symbol)) {
        logDebug(`Skipping price fetch for unsupported symbol: ${symbol}`);
        return 0;
      }

      if (investmentType === 'crypto') {
        const binance = new (ccxt.binance as any)();
        const cleanedSymbol = symbol.replace(/[:\s\-]/g, '').toUpperCase();
        const ticker = await binance.fetchTicker(`${cleanedSymbol}/USDT`);
        return ticker.percentage || 0;
      } else if (investmentType === 'stock' || investmentType === 'etf') {
        try {
          const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
          const result = (await yf.quote(symbol)) as any;
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

  /** Fetch investment accounts and holdings for one Plaid Item. */
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
        // Some institutions include non-investment accounts; filter to avoid mislabeling Broker
        const bucket = classifyPlaidAccountBucket((account as any).type, (account as any).subtype);
        if (bucket !== 'investment') {
          continue;
        }

        const invAccount: PlaidInvestmentAccountPayload = {
          id: account.account_id,
          name: `${item.institutionName} · ${account.name}`,
          type: 'Broker',
          logo: getInstitutionLogoUrl(item.institutionName),
        };
        if ((account as any).logo) {
          invAccount.plaidLogo = (account as any).logo;
        }
        investmentAccounts.push(invAccount);
      }

      for (const holding of holdingsResponse.data.holdings) {
        const security: any = securitiesById.get(holding.security_id);
        if (!security) continue;

        const investmentType = mapPlaidInvestmentType(security.type, security.ticker_symbol);
        const quantity = Number(holding.quantity || 0);
        const institutionPrice = Number(holding.institution_price || 0);
        const institutionValue = Number((holding as any).institution_value || 0);
        const fallbackPrice = quantity > 0 ? institutionValue / quantity : 0;
        const effectivePrice = institutionPrice > 0 ? institutionPrice : fallbackPrice;

        // Normalize crypto ticker for price APIs
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
          holdings: quantity,
          currentPrice: effectivePrice,
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
