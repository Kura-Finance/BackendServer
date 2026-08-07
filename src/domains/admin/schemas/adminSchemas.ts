/**
 * Zod schemas for admin APIs (dashboard reads + Bridge funds-request ops).
 */

import { z } from 'zod';
import { lazyUpdateQuerySchema } from '../../platform-insights/schemas/platformInsightsSchemas';

export { lazyUpdateQuerySchema };

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** Path param for admin Bridge customer delete by Kura userId. */
export const bridgeCostDeleteUserParamSchema = z.object({
  userId: z.string().uuid(),
});

export const fundsRequestStatusSchema = z.enum([
  'open',
  'return_initiated',
  'returned',
  'failed',
  'ignored',
]);

const boolQuery = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === 'true' || value === '1';
  });

export const listFundsRequestsQuerySchema = z
  .object({
    /** Prefer `flagged` in prod — some WAFs block the literal query key `fraud`. */
    flagged: boolQuery,
    fraud: boolQuery,
    status: fundsRequestStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .transform((value) => ({
    fraud: value.flagged ?? value.fraud,
    status: value.status,
    limit: value.limit,
    offset: value.offset,
  }));

export const fundsRequestIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const fraudRateQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
});

export const bridgeCustomerIdParamSchema = z.object({
  bridgeCustomerId: z.string().trim().min(1),
});

/** List / notify Bridge customers with no activity for N months. */
export const inactiveBridgeCustomersQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).optional(),
  /** Default true — only customers that still have activated VAs (fee drivers). */
  onlyWithActivatedVa: boolQuery,
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
