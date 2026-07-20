import { z } from 'zod';

const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address (0x + 40 hex chars)');

const treasurySource = z.enum(['created', 'bound']);

export const treasuryItemSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(64).optional(),
    address: ethAddress,
    source: treasurySource,
    saltNonce: z.string().regex(/^\d+$/).optional(),
    createdAt: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.source === 'created' && !val.saltNonce) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'saltNonce is required when source is created',
        path: ['saltNonce'],
      });
    }
    if (val.source === 'bound' && val.saltNonce) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'saltNonce must be omitted when source is bound',
        path: ['saltNonce'],
      });
    }
  });

export const createTreasuryBodySchema = treasuryItemSchema;

export const patchTreasuryBodySchema = z.object({
  name: z.string().trim().min(1).max(64),
});

export const setActiveTreasuryBodySchema = z.object({
  activeTreasuryId: z.string().min(1).max(64).nullable(),
});

export const replaceTreasuriesBodySchema = z.object({
  activeTreasuryId: z.string().min(1).max(64).nullable(),
  treasuries: z.array(treasuryItemSchema).max(50),
});

export const treasuryIdParamsSchema = z.object({
  id: z.string().min(1).max(64),
});
