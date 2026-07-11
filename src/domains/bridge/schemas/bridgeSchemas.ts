import { z } from 'zod';

// 金額：decimal string（例如 "100.25"、"0.1"）。允許可選小數。
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string');

// EVM / Solana 地址（寬鬆驗證，由 Bridge 做最終校驗）
const cryptoAddress = z.string().trim().min(20, 'invalid crypto address').max(120);

// 法幣 rails 與 crypto rails（off-ramp Pay Out）
const fiatRail = z.enum([
  'ach',
  'ach_push',
  'ach_same_day',
  'wire',
  'sepa',
  'faster_payments',
  'pix',
  'spei',
]);

const payoutRailCurrency: Record<z.infer<typeof fiatRail>, z.infer<typeof fiatCurrency>> = {
  ach: 'usd',
  ach_push: 'usd',
  ach_same_day: 'usd',
  wire: 'usd',
  sepa: 'eur',
  faster_payments: 'gbp',
  pix: 'brl',
  spei: 'mxn',
};
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

const ethAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'toAddress must be a valid EVM address');

const tronAddress = z
  .string()
  .trim()
  .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, 'returnAddress must be a valid Tron address');

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
export const createEndorsementLinkBodySchema = z
  .object({
    endorsement: endorsementType.optional(),
    currency: fiatCurrency.optional(),
    redirectUri: z.string().trim().url('redirectUri must be a valid URL').optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.endorsement && !data.currency) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either endorsement or currency is required',
        path: ['endorsement'],
      });
    }
  });

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

// ── Payout Liquidation Address（Base USDC → 法幣，永久出金地址）────────
export const createPayoutAddressBodySchema = z
  .object({
    destinationRail: fiatRail,
    destinationCurrency: fiatCurrency,
    externalAccountId: z.string().trim().min(1, 'externalAccountId is required'),
    returnAddress: ethAddress.optional(),
    destinationReference: z.string().trim().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const expectedCurrency = payoutRailCurrency[data.destinationRail];
    if (expectedCurrency !== data.destinationCurrency) {
      ctx.addIssue({
        code: 'custom',
        message: `destinationRail "${data.destinationRail}" requires destinationCurrency "${expectedCurrency}"`,
        path: ['destinationCurrency'],
      });
    }
  });

// ── Crypto 入金：Liquidation Address（Tron USDT → Base USDC，永久地址）────────
// 固定幣對；Bridge 回傳永久 Tron 地址 + memo，無需每次建立 transfer。
export const createCryptoDepositAddressBodySchema = z.object({
  toAddress: ethAddress.optional(),
  returnAddress: tronAddress.optional(),
});

// ── External Account（off-ramp 出金銀行帳戶）──────────────────────────

function pickStr(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function resolveExternalAccountType(body: Record<string, unknown>): string {
  return (
    pickStr(body, 'accountType', 'account_type')
    ?? (pickStr(body, 'brCode', 'br_code') ? 'pix' : undefined)
    ?? (pickStr(body, 'pixKey', 'pix_key') ? 'pix' : undefined)
    ?? (pickStr(body, 'clabe') ? 'clabe' : undefined)
    ?? (pickStr(body, 'sortCode', 'sort_code') ? 'gb' : undefined)
    ?? (pickStr(body, 'iban') ? 'iban' : undefined)
    ?? 'us'
  );
}

export const createExternalAccountBodySchema = z
  .object({
    currency: fiatCurrency.default('usd'),
    bankName: z.string().trim().max(200).optional(),
    accountOwnerName: z.string().trim().max(200).optional(),
    accountType: z.enum(['us', 'iban', 'clabe', 'pix', 'gb']).optional(),
    // US ACH / Wire
    accountNumber: z.string().trim().max(64).optional(),
    routingNumber: z.string().trim().max(32).optional(),
    checkingOrSavings: z.enum(['checking', 'savings']).optional(),
    // SEPA / IBAN
    iban: z.string().trim().max(64).optional(),
    bic: z.string().trim().max(32).optional(),
    // MXN SPEI (CLABE)
    clabe: z.string().trim().max(32).optional(),
    // BRL Pix
    pixKey: z.string().trim().max(200).optional(),
    brCode: z.string().trim().max(500).optional(),
    documentNumber: z.string().trim().max(32).optional(),
    // GBP Faster Payments
    sortCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'sortCode must be 6 digits')
      .optional(),
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
  .passthrough()
  .superRefine((data, ctx) => {
    const body = data as Record<string, unknown>;
    const accountType = resolveExternalAccountType(body);

    if (!pickStr(body, 'accountOwnerName', 'account_owner_name')) {
      ctx.addIssue({
        code: 'custom',
        message: 'accountOwnerName is required',
        path: ['accountOwnerName'],
      });
    }

    if (accountType === 'us') {
      if (!pickStr(body, 'accountNumber', 'account_number')) {
        ctx.addIssue({
          code: 'custom',
          message: 'accountNumber is required for US accounts',
          path: ['accountNumber'],
        });
      }
      if (!pickStr(body, 'routingNumber', 'routing_number')) {
        ctx.addIssue({
          code: 'custom',
          message: 'routingNumber is required for US accounts',
          path: ['routingNumber'],
        });
      }
      return;
    }

    if (accountType === 'iban' && !pickStr(body, 'iban')) {
      ctx.addIssue({ code: 'custom', message: 'iban is required', path: ['iban'] });
      return;
    }

    if (accountType === 'clabe' && !pickStr(body, 'clabe')) {
      ctx.addIssue({ code: 'custom', message: 'clabe is required', path: ['clabe'] });
      return;
    }

    if (accountType === 'pix') {
      if (!pickStr(body, 'pixKey', 'pix_key') && !pickStr(body, 'brCode', 'br_code')) {
        ctx.addIssue({
          code: 'custom',
          message: 'pixKey or brCode is required for Pix accounts',
          path: ['pixKey'],
        });
      }
      return;
    }

    if (accountType === 'gb') {
      if (!pickStr(body, 'accountNumber', 'account_number')) {
        ctx.addIssue({
          code: 'custom',
          message: 'accountNumber is required for GB accounts',
          path: ['accountNumber'],
        });
      }
      if (!pickStr(body, 'sortCode', 'sort_code')) {
        ctx.addIssue({
          code: 'custom',
          message: 'sortCode is required for GB accounts',
          path: ['sortCode'],
        });
      }
    }
  });

// ── 路徑參數 ──────────────────────────────────────────────────────────

export const transferIdParamSchema = z.object({
  transferId: z.string().trim().min(1, 'transferId is required'),
});

export const virtualAccountIdParamSchema = z.object({
  virtualAccountId: z.string().trim().min(1, 'virtualAccountId is required'),
});

export const externalAccountIdParamSchema = z.object({
  externalAccountId: z.string().trim().min(1, 'externalAccountId is required'),
});

export const liquidationAddressIdParamSchema = z.object({
  liquidationAddressId: z.string().trim().min(1, 'liquidationAddressId is required'),
});
