/**
 * Plaid Domain Model Types
 */

export type BankingAccountType = 'checking' | 'saving' | 'credit' | 'crypto';
export type TransactionType = 'credit' | 'deposit' | 'transfer';
export type InvestmentAccountType = 'Broker' | 'Exchange';
export type InvestmentType = 'crypto' | 'stock';
export type PlaidAccountBucket = 'banking' | 'investment';

export interface StoredAccountOrderPayload {
  accountIds?: string[];
  investmentAccountIds?: string[];
}

export interface PlaidAccountPayload {
  id: string;
  name: string;
  balance: number;
  type: BankingAccountType;
  logo: string;
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
}

export interface PlaidInvestmentAccountPayload {
  id: string;
  name: string;
  type: InvestmentAccountType;
  logo: string;
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
