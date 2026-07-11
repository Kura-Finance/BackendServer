import { z } from 'zod';

export const lazyUpdateQuerySchema = z.object({
  force: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});

export const investorPeriodQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});

export const platformRecordsQuerySchema = investorPeriodQuerySchema.extend({
  category: z.enum(['revenue', 'waitlist', 'aum']).optional(),
  source: z
    .enum([
      'stripe',
      'bridge_va',
      'bridge_transfer',
      'bridge_liquidation_in',
      'bridge_liquidation_out',
      'card',
      'dinari',
      'waitlist',
      'debank',
    ])
    .optional(),
  product: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const revenueEventsQuerySchema = investorPeriodQuerySchema.extend({
  source: z
    .enum([
      'stripe',
      'bridge_va',
      'bridge_transfer',
      'bridge_liquidation_in',
      'bridge_liquidation_out',
      'card',
      'dinari',
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const scaSnapshotsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
