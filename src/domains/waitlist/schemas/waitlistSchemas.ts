/**
 * Zod schemas for waitlist join body and status/count query params.
 */

import { z } from 'zod';
import { WAITLIST_DEFAULT_PRODUCT } from '../models/types';

export const waitlistProductSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid product slug')
  .transform((value) => value.toLowerCase());

export const waitlistProductOptionalSchema = waitlistProductSchema
  .optional()
  .default(WAITLIST_DEFAULT_PRODUCT);

export const joinWaitlistBodySchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(320)
    .transform((value) => value.toLowerCase()),
  product: waitlistProductOptionalSchema,
  name: z.string().trim().min(1).max(120).optional(),
  source: z.string().trim().min(1).max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const waitlistStatusQuerySchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .max(320)
    .transform((value) => value.toLowerCase()),
  product: waitlistProductOptionalSchema,
});

export const waitlistCountQuerySchema = z.object({
  product: waitlistProductSchema.optional(),
});
