/**
 * Plaid payload builder — split plaintext Plaid rows into metadata + sensitive.
 *
 * 1. metadata — fields needed for sync / dedup / scheduling / filtering (plaintext in DB)
 * 2. sensitive — user-visible financial secrets (AES-GCM ciphertext via SEK)
 *
 * This module only splits and serializes; callers encrypt with
 * `encryptPayload(sek, sensitive)` and write to DB.
 *
 * Shared by PlaidCacheService (full sync) and PlaidWebhookSyncService (incremental)
 * so field lists stay in one place.
 */

import {
  PlaidAccountPayload,
  PlaidTransactionPayload,
  PlaidInvestmentAccountPayload,
  PlaidInvestmentPayload,
} from '../models/types';

// ─────────────────────────────────────────────────────────────
// Account
// ─────────────────────────────────────────────────────────────

export interface AccountMetadata {
  accountId: string;
  plaidItemId: string | null; // null until aggregation tags the item
  type: string; // checking | saving | credit | investment (liability math in AssetService)
  bucket: 'banking' | 'investment';
}

export interface AccountSensitive {
  name: string;
  balance: number;
  institutionName: string;
  logo: string;
  plaidLogo?: string;
  apy?: number;
  mask?: string;
}

export interface AccountSplit {
  metadata: AccountMetadata;
  sensitive: AccountSensitive;
}

export function splitAccount(
  acc: PlaidAccountPayload,
  plaidItemId: string | null,
  bucket: 'banking' | 'investment',
): AccountSplit {
  const sensitive: AccountSensitive = {
    name: acc.name,
    balance: acc.balance,
    institutionName: acc.name.split('·')[0]?.trim() || 'Bank',
    logo: acc.logo,
  };
  if (acc.plaidLogo) sensitive.plaidLogo = acc.plaidLogo;
  if (acc.apy !== undefined) sensitive.apy = acc.apy;
  if (acc.mask) sensitive.mask = acc.mask;

  return {
    metadata: {
      accountId: acc.id,
      plaidItemId,
      type: acc.type,
      bucket,
    },
    sensitive,
  };
}

// ─────────────────────────────────────────────────────────────
// Transaction
// ─────────────────────────────────────────────────────────────

export interface TransactionMetadata {
  accountId: string;
  transactionId: string;
  plaidItemId: string | null; // null until aggregation tags the item
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  isPending: boolean;
  isRecurring: boolean;
  isSubscription: boolean;
}

export interface TransactionSensitive {
  amount: string;
  merchant: string;
  category: string;
  type: string;
  personalFinanceCategory?: string;
  recurringFrequency?: string;
  enrichedMerchantName?: string;
  merchantLogo?: string;
  plaidMerchantLogo?: string;
  merchantCategory?: string;
  accountName?: string;
  accountType?: string;
}

export interface TransactionSplit {
  metadata: TransactionMetadata;
  sensitive: TransactionSensitive;
}

export function splitTransaction(
  tx: PlaidTransactionPayload,
  plaidItemId: string | null,
): TransactionSplit {
  const sensitive: TransactionSensitive = {
    amount: tx.amount,
    merchant: tx.merchant,
    category: tx.category,
    type: tx.type,
    accountName: tx.accountName,
    accountType: tx.accountType,
  };
  if (tx.personalFinanceCategory) sensitive.personalFinanceCategory = tx.personalFinanceCategory;
  if (tx.recurringFrequency) sensitive.recurringFrequency = tx.recurringFrequency;
  if (tx.enrichedMerchantName) sensitive.enrichedMerchantName = tx.enrichedMerchantName;
  if (tx.merchantLogo) sensitive.merchantLogo = tx.merchantLogo;
  if (tx.plaidMerchantLogo) sensitive.plaidMerchantLogo = tx.plaidMerchantLogo;
  if (tx.merchantCategory) sensitive.merchantCategory = tx.merchantCategory;

  return {
    metadata: {
      accountId: tx.accountId,
      transactionId: tx.id,
      plaidItemId,
      date: tx.date,
      month: tx.date.slice(0, 7),
      isPending: tx.isPending ?? false,
      isRecurring: tx.isRecurring ?? false,
      isSubscription: tx.isSubscription ?? false,
    },
    sensitive,
  };
}

// ─────────────────────────────────────────────────────────────
// Investment Account
// ─────────────────────────────────────────────────────────────

export interface InvestmentAccountMetadata {
  accountId: string;
  plaidItemId: string | null;
}

export interface InvestmentAccountSensitive {
  name: string;
  institutionName: string;
  logo: string;
  plaidLogo?: string;
}

export interface InvestmentAccountSplit {
  metadata: InvestmentAccountMetadata;
  sensitive: InvestmentAccountSensitive;
}

export function splitInvestmentAccount(
  acc: PlaidInvestmentAccountPayload,
  plaidItemId: string | null,
): InvestmentAccountSplit {
  const sensitive: InvestmentAccountSensitive = {
    name: acc.name,
    institutionName: acc.name.split('·')[0]?.trim() || 'Broker',
    logo: acc.logo,
  };
  if (acc.plaidLogo) sensitive.plaidLogo = acc.plaidLogo;

  return {
    metadata: { accountId: acc.id, plaidItemId },
    sensitive,
  };
}

// ─────────────────────────────────────────────────────────────
// Investment Holding
// ─────────────────────────────────────────────────────────────

export interface InvestmentMetadata {
  accountId: string;
  investmentId: string;
  plaidItemId: string | null;
  type: string; // stock | crypto | etf | other (for classification stats)
}

export interface InvestmentSensitive {
  symbol: string;
  name: string;
  holdings: number;
  currentPrice: number;
  change24h?: number;
  logo: string;
}

export interface InvestmentSplit {
  metadata: InvestmentMetadata;
  sensitive: InvestmentSensitive;
}

export function splitInvestment(
  inv: PlaidInvestmentPayload,
  plaidItemId: string | null,
): InvestmentSplit {
  const sensitive: InvestmentSensitive = {
    symbol: inv.symbol,
    name: inv.name,
    holdings: inv.holdings,
    currentPrice: inv.currentPrice,
    logo: inv.logo,
  };
  if (inv.change24h !== undefined) sensitive.change24h = inv.change24h;

  return {
    metadata: {
      accountId: inv.accountId,
      investmentId: inv.id,
      plaidItemId,
      type: inv.type,
    },
    sensitive,
  };
}
