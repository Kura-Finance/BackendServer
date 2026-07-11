import { z } from 'zod';

// 金額：decimal string（例如 "100.25"、"0.1"）。允許可選小數。
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string');

const optionalDecimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'developerFee must be a positive decimal string')
  .optional();

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

const fiatCurrency = z.enum(['usd', 'eur', 'mxn']);
const stablecoin = z.enum(['usdc', 'usdb', 'eurc', 'usdt', 'dai', 'pyusd']);

// ── KYC / Customer ────────────────────────────────────────────────────

export const createKycLinkBodySchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  email: z.string().trim().email('email must be valid').optional(),
  type: z.enum(['individual', 'business']).default('individual'),
});

// ── On-ramp（fiat → crypto）──────────────────────────────────────────

export const createOnRampBodySchema = z.object({
  amount: decimalAmount,
  sourceRail: fiatRail,
  sourceCurrency: fiatCurrency,
  destinationRail: cryptoRail,
  destinationCurrency: stablecoin,
  // 未提供時後端會回退到使用者錢包地址（scaAddress / walletAddress）
  toAddress: cryptoAddress.optional(),
  developerFee: optionalDecimalAmount,
  clientReferenceId: z.string().trim().max(200).optional(),
  // 允許用戶以任意金額入金（deposit 任意金額觸發轉換）
  flexibleAmount: z.boolean().optional(),
});

// ── Off-ramp（crypto → fiat）──────────────────────────────────────────

export const createOffRampBodySchema = z.object({
  amount: decimalAmount,
  sourceRail: cryptoRail,
  sourceCurrency: stablecoin,
  destinationRail: fiatRail,
  destinationCurrency: fiatCurrency,
  externalAccountId: z.string().trim().min(1, 'externalAccountId is required'),
  developerFee: optionalDecimalAmount,
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
