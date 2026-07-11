import { z } from 'zod';

// 金額：decimal string（例如 "100.25"、"0.1"）。允許可選小數。
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string');

// EVM / Solana 地址（寬鬆驗證，由 Bridge 做最終校驗）
const cryptoAddress = z.string().trim().min(20, 'invalid crypto address').max(120);

// 法幣 rails 與 crypto rails
const fiatRail = z.enum(['ach_push', 'ach_same_day', 'wire', 'sepa', 'spei']);
const cryptoRail = z.enum([
  'ethereum',
  'base',
  'polygon',
  'arbitrum',
  'optimism',
  'solana',
  'avalanche',
  'stellar',
  'tron',
]);

const fiatCurrency = z.enum(['usd', 'eur', 'mxn', 'gbp', 'brl', 'cop']);
const stablecoin = z.enum(['usdc', 'usdb', 'eurc', 'usdt', 'dai', 'pyusd']);

// ── KYC / Customer ────────────────────────────────────────────────────

// 可申請的 endorsement（rail）類型
const endorsementType = z.enum([
  'base',
  'cards',
  'cop',
  'faster_payments',
  'pix',
  'sepa',
  'spei',
]);

// individual = KYC，business = KYB。
// fullName 對 business 而言是「公司法定名稱」（Bridge 允許至 1024 字）。
export const createKycLinkBodySchema = z.object({
  type: z.enum(['individual', 'business']).default('individual'),
  fullName: z.string().trim().min(1, 'fullName is required').max(1024),
  email: z.string().trim().email('email must be valid').optional(),
  endorsements: z.array(endorsementType).min(1).optional(),
  redirectUri: z.string().trim().url('redirectUri must be a valid URL').optional(),
  // 含非 Latin-1 字元時 Bridge 要求提供羅馬化名稱
  transliteratedFirstName: z.string().trim().min(1).max(256).optional(),
  transliteratedMiddleName: z.string().trim().min(1).max(256).optional(),
  transliteratedLastName: z.string().trim().min(1).max(256).optional(),
  transliteratedBusinessLegalName: z.string().trim().min(1).max(1024).optional(),
});

// ── On-ramp（fiat → crypto）：改用 Virtual Account ────────────────────
// 入金一律走 VA：建立 / 取得使用者專屬的法幣入金帳戶（持久、免 memo），
// 入金後 Bridge 自動轉成穩定幣送往 destination。

export const createOnRampBodySchema = z.object({
  sourceCurrency: fiatCurrency,
  destinationRail: cryptoRail,
  destinationCurrency: stablecoin,
  // 未提供時後端會回退到使用者錢包地址（scaAddress / walletAddress）
  toAddress: cryptoAddress.optional(),
  // 費率（developer fee）由後端依入金幣別套用，不接受 client 指定。
});

// ── Off-ramp（crypto → fiat）──────────────────────────────────────────

export const createOffRampBodySchema = z.object({
  amount: decimalAmount,
  sourceRail: cryptoRail,
  sourceCurrency: stablecoin,
  destinationRail: fiatRail,
  destinationCurrency: fiatCurrency,
  externalAccountId: z.string().trim().min(1, 'externalAccountId is required'),
  // developerFee 不接受 client 指定：一律由後端依目的幣別計算（保證 ≥ Bridge 成本）。
  clientReferenceId: z.string().trim().max(200).optional(),
});

// ── External Account（off-ramp 出金銀行帳戶）──────────────────────────
// 直接轉發 Bridge external_account payload，保留彈性（US ACH / SEPA IBAN 等）。

export const createExternalAccountBodySchema = z
  .object({
    currency: fiatCurrency.default('usd'),
    bankName: z.string().trim().max(200).optional(),
    accountOwnerName: z.string().trim().max(200).optional(),
    accountType: z.enum(['us', 'iban']).optional(),
    // US ACH
    accountNumber: z.string().trim().max(64).optional(),
    routingNumber: z.string().trim().max(32).optional(),
    // SEPA / IBAN
    iban: z.string().trim().max(64).optional(),
    bic: z.string().trim().max(32).optional(),
    // 受款人
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    businessName: z.string().trim().max(200).optional(),
    address: z
      .object({
        street_line_1: z.string().trim().max(200),
        street_line_2: z.string().trim().max(200).optional(),
        city: z.string().trim().max(100),
        state: z.string().trim().max(100).optional(),
        postal_code: z.string().trim().max(20),
        country: z.string().trim().min(2).max(3),
      })
      .optional(),
  })
  .passthrough();

// ── 路徑參數 ──────────────────────────────────────────────────────────

export const transferIdParamSchema = z.object({
  transferId: z.string().trim().min(1, 'transferId is required'),
});

export const virtualAccountIdParamSchema = z.object({
  virtualAccountId: z.string().trim().min(1, 'virtualAccountId is required'),
});
