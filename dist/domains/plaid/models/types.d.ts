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
    logo: string;
    plaidLogo?: string;
    apy?: number;
    mask?: string;
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
    personalFinanceCategory?: string;
    isRecurring?: boolean;
    recurringFrequency?: string;
    isSubscription?: boolean;
    enrichedMerchantName?: string;
    merchantLogo?: string;
    plaidMerchantLogo?: string;
    merchantCategory?: string;
    isPending?: boolean;
}
export interface PlaidInvestmentAccountPayload {
    id: string;
    name: string;
    type: InvestmentAccountType;
    logo: string;
    plaidLogo?: string;
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
//# sourceMappingURL=types.d.ts.map