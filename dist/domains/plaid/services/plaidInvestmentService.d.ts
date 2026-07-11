/**
 * Plaid 投資服務
 * 處理投資持倉、資產類型與價格資料
 */
import { PlaidInvestmentPayload, PlaidInvestmentAccountPayload } from '../models/types';
export declare class PlaidInvestmentService {
    /**
     * 獲取投資商品的 24h 變化百分比
     * 對於加密貨幣使用 CCXT，對於股票和 ETF 使用 yahoo-finance2
     */
    static getInvestmentPriceChange24h(symbol: string, investmentType: 'crypto' | 'stock' | 'etf'): Promise<number>;
    /**
     * 取得投資帳戶和持倉
     */
    static fetchInvestmentHoldings(userPlaidClient: any, item: {
        institutionName: string;
    }, decryptedAccessToken: string): Promise<{
        investmentAccounts: PlaidInvestmentAccountPayload[];
        investments: PlaidInvestmentPayload[];
    }>;
}
//# sourceMappingURL=plaidInvestmentService.d.ts.map