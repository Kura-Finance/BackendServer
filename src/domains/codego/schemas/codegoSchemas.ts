import { z } from 'zod';

export const createKycSessionBodySchema = z.object({
  applicantType: z.enum(['individual', 'company']).optional(),
  email: z.string().email().optional(),
  origin: z.string().url().optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  returnUrl: z.string().url().optional(),
  resumeSessionId: z.string().trim().min(1).max(200).optional(),
});

export const cardIdParamSchema = z.object({
  cardId: z.string().trim().min(1).max(200),
});

export const transactionIdParamSchema = z.object({
  txId: z.string().trim().min(1).max(200),
});

export const issueCardBodySchema = z
  .object({
    cardType: z.enum(['virtual', 'physical']).optional(),
  })
  .passthrough();

export const updateCardBodySchema = z.record(z.string(), z.unknown());

export const createDisputeBodySchema = z.record(z.string(), z.unknown());

export const listTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
