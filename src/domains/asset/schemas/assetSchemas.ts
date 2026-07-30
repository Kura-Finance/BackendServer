/**
 * Zod schemas for asset API request validation.
 */
import { z } from 'zod';

/** Query for GET /api/assets/history[/encrypted]. */
export const getAssetHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});
