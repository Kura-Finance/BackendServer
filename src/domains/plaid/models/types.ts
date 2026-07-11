/**
 * Plaid 領域模型型別
 */

export type BankingAccountType = 'checking' | 'saving' | 'credit' | 'crypto';
export type TransactionType = 'credit' | 'deposit' | 'transfer';
export type InvestmentAccountType = 'Broker' | 'Exchange';
export type InvestmentType = 'crypto' | 'stock' | 'etf';
export type PlaidAccountBucket = 'banking' | 'investment';

export interface PlaidAccountPayload {
  id: string;
  name: string;
  balance: number;
  type: BankingAccountType;
  logo: string; // 優先使用我們生成的 logo（Logo.dev），如果 Plaid 返回則使用 Plaid 的
  plaidLogo?: string; // Plaid 原生返回的 logo (SVG URL)
  apy?: number; // 年化報酬率 (APY) - 儲蓄/支票帳戶
  mask?: string; // 帳號末 4 碼（部分機構不提供時為 undefined）
}

export interface PlaidTransactionPayload {
  id: string;
  accountId: string;
  accountName: string;
  accountType: BankingAccountType;
  amount: string;
  date: string;
  merchant: string;
  category: string;
  type: TransactionType;
  
  // ===== 進階交易信息 =====
  personalFinanceCategory?: string; // Plaid PFC 分類
  isRecurring?: boolean; // 是否為定期交易
  recurringFrequency?: string; // 重複頻率 (WEEKLY, MONTHLY, YEARLY 等)
  isSubscription?: boolean; // 是否為訂閱交易
  enrichedMerchantName?: string; // 商家正式名稱
  merchantLogo?: string; // 商家 LOGO URL（來自 Plaid）
  plaidMerchantLogo?: string; // Plaid 原生返回的商家 logo (如果有)
  merchantCategory?: string; // 商家分類
  isPending?: boolean; // 是否為待處理交易
}

export interface PlaidInvestmentAccountPayload {
  id: string;
  name: string;
  type: InvestmentAccountType;
  logo: string; // 我們生成的 logo
  plaidLogo?: string; // Plaid 原生返回的 logo (如果有)
}

export interface PlaidInvestmentPayload {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  holdings: number;
  currentPrice: number;
  change24h: number;
  type: InvestmentType;
  logo: string;
}

export interface FinanceSnapshot {
  accounts: PlaidAccountPayload[];
  transactions: PlaidTransactionPayload[];
  investmentAccounts: PlaidInvestmentAccountPayload[];
  investments: PlaidInvestmentPayload[];
}
