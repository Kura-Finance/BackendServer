/**
 * Zod schemas for admin APIs (dashboard reads + Bridge funds-request ops).
 */

import { z } from 'zod';
import { lazyUpdateQuerySchema } from '../../platform-insights/schemas/platformInsightsSchemas';

export { lazyUpdateQuerySchema };

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const fundsRequestStatusSchema = z.enum([
  'open',
  'return_initiated',
  'returned',
  'failed',
  'ignored',
]);

export const listFundsRequestsQuerySchema = z.object({
  fraud: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === 'true' || value === '1';
    }),
  status: fundsRequestStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const fundsRequestIdParamSchema = z.object({
  id: z.string().trim().min(1),
});
