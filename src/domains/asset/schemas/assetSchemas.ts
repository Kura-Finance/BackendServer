import { z } from 'zod';

const isoDateString = z
  .string()
  .datetime({ message: 'must be a valid ISO datetime string' })
  .transform((value) => new Date(value));

const assetSnapshotSchema = z.object({
  assetId: z.string().trim().min(1, 'assetId is required'),
  name: z.string().trim().min(1, 'name is required'),
  type: z.enum(['bank_account', 'investment', 'crypto_wallet'], {
    message: 'type must be one of: bank_account, investment, crypto_wallet',
  }),
  value: z.coerce.number().finite('value must be a valid number'),
  currency: z.string().trim().min(1).max(10).optional(),
  recordedAt: z.union([isoDateString, z.date()]).optional(),
});

export const recordAssetSnapshotBodySchema = assetSnapshotSchema;

export const recordMultipleSnapshotsBodySchema = z.object({
  snapshots: z.array(assetSnapshotSchema).min(1, 'snapshots must be a non-empty array'),
});

export const getAssetHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const deleteAssetHistoryParamsSchema = z.object({
  assetId: z.string().trim().min(1, 'assetId is required'),
});
