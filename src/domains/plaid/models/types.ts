/**
 * Plaid domain model types for accounts, transactions, and investments.
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
  logo: string; // Prefer our Logo.dev logo; fall back to Plaid when present
  plaidLogo?: string; // Plaid-native logo (SVG URL)
  apy?: number; // Annual percentage yield for savings/checking
  mask?: string; // Last 4 digits (undefined when institution omits)
  plaidItemId?: string; // Owning Plaid Item (set during aggregation fetch)
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

  // ===== Enriched transaction fields =====
  personalFinanceCategory?: string; // Plaid PFC category
  isRecurring?: boolean;
  recurringFrequency?: string; // WEEKLY, MONTHLY, YEARLY, etc.
  isSubscription?: boolean;
  enrichedMerchantName?: string;
  merchantLogo?: string; // Merchant logo URL from Plaid
  plaidMerchantLogo?: string; // Plaid-native merchant logo when present
  merchantCategory?: string;
  isPending?: boolean;
  plaidItemId?: string; // Owning Plaid Item (set during aggregation fetch)
}

export interface PlaidInvestmentAccountPayload {
  id: string;
  name: string;
  type: InvestmentAccountType;
  logo: string; // Our generated logo
  plaidLogo?: string; // Plaid-native logo when present
  plaidItemId?: string; // Owning Plaid Item (for cache cascade relation)
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
  plaidItemId?: string; // Owning Plaid Item (for cache cascade relation)
}

export interface FinanceSnapshot {
  accounts: PlaidAccountPayload[];
  transactions: PlaidTransactionPayload[];
  investmentAccounts: PlaidInvestmentAccountPayload[];
  investments: PlaidInvestmentPayload[];
}
