/**
 * Plaid 資料轉換器 - 共用資料映射與正規化工具
 * 與服務邏輯解耦，提升可重用性與可測試性
 */
import { BankingAccountType, TransactionType, InvestmentType, PlaidAccountBucket } from '../models/types';
/**
 * 常見的加密貨幣代號 symbol（含各種格式變化）
 */
export declare const CRYPTO_SYMBOLS: Set<string>;
/**
 * 將 Plaid 帳戶類型對應到應用程式類型
 */
export declare const mapPlaidAccountType: (type: string, subtype?: string | null) => BankingAccountType;
/**
 * 將交易金額對應到交易類型
 */
export declare const mapPlaidTransactionType: (amount: number, category?: string | null) => TransactionType;
/**
 * 將投資商品類型對應到應用程式投資類型
 */
export declare const mapPlaidInvestmentType: (securityType?: string | null, tickerSymbol?: string | null) => InvestmentType;
/**
 * 將帳戶分類為銀行帳戶或投資帳戶
 */
export declare const classifyPlaidAccountBucket: (type?: string | null, subtype?: string | null) => PlaidAccountBucket;
/**
 * 正規化加密貨幣 symbol
 * 處理各種格式：\"btc.com\" -> \"BTC\"、\"Bitcoin\" -> \"BTC\"
 */
export declare function normalizeCryptoSymbol(symbol: string): string | null;
/**
 * 檢查 symbol 是否為貨幣或不支持的資產類型
 */
export declare const isCurrencyOrUnsupported: (symbol: string) => boolean;
//# sourceMappingURL=plaidDataTransformer.d.ts.map