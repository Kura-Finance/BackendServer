/**
 * Zod request schemas for Bridge HTTP routes.
 */

import { z } from 'zod';

// Amount as decimal string (e.g. "100.25", "0.1"); optional fractional part.
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a positive decimal string');

// EVM / Solana address (loose check; Bridge validates finally)
const cryptoAddress = z.string().trim().min(20, 'invalid crypto address').max(120);

// Fiat rails and crypto rails (off-ramp Pay Out)
const fiatRail = z.enum([
  'ach',
  'ach_push',
  'ach_same_day',
  'wire',
  'sepa',
  'faster_payments',
  'pix',
  'spei',
  'bre_b',
  'co_bank_transfer',
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
  bre_b: 'cop',
  co_bank_transfer: 'cop',
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

// Requestable endorsement (rail) types
const endorsementType = z.enum([
  'base',
  'cards',
  'cop',
  'faster_payments',
  'pix',
  'sepa',
  'spei',
]);

// individual = KYC, business = KYB.
// For business, fullName is the legal company name (Bridge allows up to 1024 chars).
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
  // Bridge requires romanized names when non-Latin-1 characters are present
  transliteratedFirstName: z.string().trim().min(1).max(256).optional(),
  transliteratedMiddleName: z.string().trim().min(1).max(256).optional(),
  transliteratedLastName: z.string().trim().min(1).max(256).optional(),
  transliteratedBusinessLegalName: z.string().trim().min(1).max(1024).optional(),
});

// ── On-ramp (fiat → crypto): Virtual Account ─────────────────────────
// Deposits always use a VA: get/create a persistent fiat deposit account (no memo);
// Bridge converts to stablecoin and sends to destination.

export const createOnRampBodySchema = z.object({
  sourceCurrency: fiatCurrency,
  destinationRail: cryptoRail,
  destinationCurrency: stablecoin,
  // If omitted, backend falls back to user wallet (scaAddress / walletAddress)
  toAddress: cryptoAddress.optional(),
  // Developer fee is applied server-side from deposit currency; not client-set.
});

// ── Payout Liquidation Address (Base USDC → fiat, permanent) ────────
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

// ── Crypto deposit: Liquidation Address (Tron USDT → Base USDC) ───────
// Fixed pair; Bridge returns a permanent Tron address + memo (no per-transfer create).
export const createCryptoDepositAddressBodySchema = z.object({
  toAddress: ethAddress.optional(),
  returnAddress: tronAddress.optional(),
});

// ── External Account (off-ramp bank account) ─────────────────────────

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
    // Beneficiary
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

// ── Path params ─────────────────────────────────────────────────────

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

export const bridgeDepositsQuerySchema = z.object({
  force: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});
