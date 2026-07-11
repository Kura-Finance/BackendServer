/**
 * Plaid Payload Builder
 *
 * 把「Plaid 從 API 拉到的明文 row」拆成兩部分：
 *   1. metadata — 後端需要做 sync / dedup / 排程 / 篩選的欄位（明文留 DB）
 *   2. sensitive — 純粹給使用者看的金融機密（用 SEK 加密成 payloadCiphertext）
 *
 * 本檔案只負責「拆與序列化」，不負責「加密」與「寫 DB」，
 * 加密由 caller 用 `encryptPayload(sek, sensitive)` 完成。
 *
 * 之所以拆檔：
 *   - 同樣的 metadata 拆分邏輯在 PlaidCacheService（全量同步）與
 *     PlaidWebhookSyncService（增量同步）都會用到。
 *   - 把欄位清單集中管理避免漏欄位（例如新增 merchantSubCategory 時只改一處）。
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
  plaidItemId: string | null;  // 目前 aggregation 流程沒帶入，先 null；之後可追溯
  type: string;     // checking | saving | credit | investment（AssetService 算負債用）
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
  plaidItemId: string | null;  // 目前 aggregation 流程沒帶入，先 null
  date: string;       // YYYY-MM-DD
  month: string;      // YYYY-MM
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
  type: string;       // stock | crypto | etf | other（分類統計用）
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
