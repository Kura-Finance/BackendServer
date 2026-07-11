import { z } from 'zod';

const evenHexString = z
  .string()
  .trim()
  .regex(/^(?:[a-fA-F0-9]{2})+$/, 'must be an even-length hex string')
  .transform((value) => value.toLowerCase());

export const emailBodySchema = z.object({
  email: z.string().trim().email('must be a valid email address'),
});

export const srpPayloadSchema = z.object({
  srpSalt: evenHexString,
  srpVerifier: evenHexString,
  encryptedDataKey: evenHexString,
  kekSalt: evenHexString,
});

export const resetPasswordBodySchema = emailBodySchema
  .extend({
    resetCode: z.string().trim().regex(/^\d{6}$/, 'resetCode must be 6 digits'),
    preserveData: z.boolean().optional(),
  })
  .extend({ ...srpPayloadSchema.shape });

export const srpVerifyBodySchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
  clientA: evenHexString,
  clientM1: evenHexString,
});

export const verifyEmailAndRegisterBodySchema = emailBodySchema
  .extend({
    verificationCode: z.string().trim().regex(/^\d{6}$/, 'verificationCode must be 6 digits'),
  })
  .extend({ ...srpPayloadSchema.shape });

export const requestEmailChangeBodySchema = z.object({
  newEmail: z.string().trim().email('newEmail must be a valid email address'),
});

export const confirmEmailChangeBodySchema = z.object({
  newEmail: z.string().trim().email('newEmail must be a valid email address'),
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

export const updateDisplayNameBodySchema = z.object({
  displayName: z.string().trim().min(1, 'displayName is required').max(50, 'displayName max length is 50'),
});

export const updateAvatarBodySchema = z.object({
  avatar: z
    .string()
    .trim()
    .regex(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/, 'avatar must be a valid base64 image data URL')
    .max(10 * 1024 * 1024, 'avatar size exceeds 10MB limit'),
});

export const updateProfileBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'displayName cannot be empty').max(50, 'displayName max length is 50').optional(),
    avatarUrl: z.string().trim().url('avatarUrl must be a valid URL').max(500, 'avatarUrl max length is 500').optional(),
  })
  .refine(
    (data) => data.displayName !== undefined || data.avatarUrl !== undefined,
    { message: 'At least one field is required', path: ['body'] },
  );
