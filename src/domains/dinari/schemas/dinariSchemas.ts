import { z } from 'zod';

// 寬鬆地址驗證（EVM）；最終由 Dinari 校驗
const evmAddress = z.string().trim().min(20, 'invalid wallet address').max(120);

// 正小數字串（金額 / 數量）
const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a positive decimal string');

// ── KYC / Entity ──────────────────────────────────────────────────────

export const ensureEntityBodySchema = z.object({
  // entity 顯示名稱（內部標籤；實際身分由 KYC 流程蒐集）
  name: z.string().trim().min(1).max(200).optional(),
});

// ── Wallet 連接（用戶自管 SCA）────────────────────────────────────────

export const walletNonceBodySchema = z.object({
  walletAddress: evmAddress,
  chainId: z.string().trim().min(1).optional(), // CAIP-2，預設用 env
});

export const walletConnectBodySchema = z.object({
  walletAddress: evmAddress,
  chainId: z.string().trim().min(1).optional(), // CAIP-2，預設用 env
  nonce: z.string().trim().min(1, 'nonce is required'),
  signature: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]+$/, 'signature must be a hex string'),
});

// ── 行情 ──────────────────────────────────────────────────────────────

export const listStocksQuerySchema = z.object({
  symbols: z.string().trim().optional(), // 逗號分隔
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const stockIdParamSchema = z.object({
  stockId: z.string().trim().min(1, 'stockId is required'),
});

// ── 下單（市價，自管錢包 EIP155）──────────────────────────────────────

export const prepareMarketOrderBodySchema = z
  .object({
    side: z.enum(['BUY', 'SELL']),
    stockId: z.string().trim().min(1, 'stockId is required'),
    // 市價買用 paymentTokenQuantity（穩定幣金額）；市價賣用 assetTokenQuantity（股數）
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

// ── 路徑參數 ──────────────────────────────────────────────────────────

export const orderIdParamSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
});
