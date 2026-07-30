/** Zod schemas for Dinari KYC, wallet, market data, and order endpoints. */

import { z } from 'zod';

const ethAddress = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'walletAddress must be a valid EVM address (0x + 40 hex chars)')
  .transform((value) => value.toLowerCase());

// CAIP-2 (eip155:8453) or numeric chain id (8453); normalized server-side
const chainIdInput = z
  .string()
  .trim()
  .min(1)
  .regex(/^(eip155:\d+|\d+)$/, 'chainId must be CAIP-2 (eip155:8453) or numeric chain id')
  .optional();

// Positive decimal string (amount / quantity)
const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a positive decimal string');

// ── KYC / Entity ──────────────────────────────────────────────────────

export const ensureEntityBodySchema = z.object({
  // Entity display name (internal label; identity collected via KYC)
  name: z.string().trim().min(1).max(200).optional(),
});

// ── Wallet connect (user self-custodial SCA) ──

export const walletNonceBodySchema = z.object({
  walletAddress: ethAddress,
  chainId: chainIdInput,
});

export const walletConnectBodySchema = z.object({
  walletAddress: ethAddress,
  chainId: chainIdInput,
  nonce: z.string().trim().min(1, 'nonce is required'),
  signature: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]+$/, 'signature must be a hex string'),
});

// ── Market data ──

export const listStocksQuerySchema = z.object({
  symbols: z.string().trim().optional(), // comma-separated
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const stockIdParamSchema = z.object({
  stockId: z.string().trim().min(1, 'stockId is required'),
});

// ── Orders (market, self-custodial EIP-155) ──

export const prepareMarketOrderBodySchema = z
  .object({
    side: z.enum(['BUY', 'SELL']),
    stockId: z.string().trim().min(1, 'stockId is required'),
    // Market BUY: paymentTokenQuantity (stablecoin); market SELL: assetTokenQuantity (shares)
    paymentTokenQuantity: decimalString.optional(),
    assetTokenQuantity: decimalString.optional(),
    clientOrderId: z.string().trim().max(200).optional(),
  })
  .refine(
    (v) =>
      (v.side === 'BUY' && !!v.paymentTokenQuantity) ||
      (v.side === 'SELL' && !!v.assetTokenQuantity),
    {
      message:
        'BUY requires paymentTokenQuantity; SELL requires assetTokenQuantity',
    },
  );

export const submitOrderBodySchema = z.object({
  orderRequestId: z.string().trim().min(1, 'orderRequestId is required'),
  permitSignature: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]+$/, 'permitSignature must be a hex string'),
});

// ── Path params ──

export const orderIdParamSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
});
