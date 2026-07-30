/** Zod schemas for Stripe checkout and billing portal requests. */

import { z } from 'zod';

export const createCheckoutSessionBodySchema = z.object({
  priceId: z.string().trim().min(1, 'priceId is required'),
  successUrl: z.string().trim().url('successUrl must be a valid URL'),
  cancelUrl: z.string().trim().url('cancelUrl must be a valid URL'),
});

export const createBillingPortalSessionBodySchema = z.object({
  returnUrl: z.string().trim().url('returnUrl must be a valid URL'),
});
