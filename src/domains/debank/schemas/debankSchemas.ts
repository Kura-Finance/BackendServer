import { z } from 'zod';

export const getProtocolsQuerySchema = z.object({
  address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'address must be a valid EVM address'),
  refresh: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return false;
    }),
});

export type GetProtocolsQuery = z.infer<typeof getProtocolsQuerySchema>;

export const unlinkAddressParamsSchema = z.object({
  address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'address must be a valid EVM address'),
});

export type UnlinkAddressParams = z.infer<typeof unlinkAddressParamsSchema>;
