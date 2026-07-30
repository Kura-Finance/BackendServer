/**
 * Zod schemas for wallet API request validation.
 */
import { z } from 'zod';

const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address (0x + 40 hex chars)');

/** PUT /api/wallet/sca body. */
export const updateScaBodySchema = z.object({
  scaAddress: ethAddress,
});

/** PUT /api/wallet/eoa body. */
export const updateEoaBodySchema = z.object({
  walletAddress: ethAddress,
});
