/**
 * Zod schemas for Plaid API request validation.
 */
import { z } from 'zod';

export const exchangePublicTokenBodySchema = z.object({
  public_token: z.string().trim().min(1, 'public_token is required'),
  institution_name: z.string().trim().min(1).optional(),
});

export const disconnectPlaidItemBodySchema = z.object({
  accountId: z.string().trim().min(1, 'accountId is required'),
});

export const getFinanceSnapshotQuerySchema = z.object({
  refresh: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return false;
    }),
});
