import { z } from 'zod';

const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address (0x + 40 hex chars)');

export const updateScaBodySchema = z.object({
  scaAddress: ethAddress,
});

export const updateEoaBodySchema = z.object({
  walletAddress: ethAddress,
});
