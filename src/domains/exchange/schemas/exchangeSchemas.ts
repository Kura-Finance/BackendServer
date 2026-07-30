/** Zod schemas for exchange connect and account path params. */

import { z } from 'zod';
import { KURA_SUPPORTED_EXCHANGES } from '../../shared/lib/symbolsAndExchangesUtil';

const supportedExchangeIds = KURA_SUPPORTED_EXCHANGES.map((exchange) => exchange.id.toLowerCase());

export const connectExchangeBodySchema = z.object({
  exchange: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => supportedExchangeIds.includes(value), 'unsupported exchange'),
  apiKey: z.string().trim().min(1, 'apiKey is required'),
  apiSecret: z.string().trim().min(1, 'apiSecret is required'),
  passphrase: z.string().trim().min(1).optional(),
});

export const exchangeAccountIdParamsSchema = z.object({
  exchangeAccountId: z
    .string()
    .trim()
    .min(1, 'exchangeAccountId is required')
    .refine((value) => value !== 'undefined', 'exchangeAccountId is required'),
});
