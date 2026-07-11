import { z } from 'zod';

const ethAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address');

export const gpAuthBodySchema = z.object({
  message: z.string().min(1, 'SIWE message required'),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid hex signature'),
});

export const gpSignUpBodySchema = z.object({
  email: z.string().email().optional(),
});

export const gpSofBodySchema = z.object({
  sourceOfFunds: z.string().min(1),
}).passthrough();

export const gpPhoneSendBodySchema = z.object({
  phone: z.string().min(5, 'Phone number required'),
});

export const gpPhoneVerifyBodySchema = z.object({
  code: z.string().min(4, 'OTP code required'),
});

export const gpNonceQuerySchema = z.object({
  address: ethAddress,
});
