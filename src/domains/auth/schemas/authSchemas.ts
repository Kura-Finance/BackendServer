/**
 * Zod request schemas for auth routes (login, passkey, keypair, profile).
 */

import { z } from 'zod';

const base64String = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9+/]+=*$/, 'must be a valid base64 string');

const hexString = z
  .string()
  .trim()
  .regex(/^(?:[a-fA-F0-9]{2})+$/, 'must be an even-length hex string')
  .transform((value) => value.toLowerCase());

// ── Privy login ─────────────────────────────────────────────────────
// accessToken: Privy access token (required; authoritative login proof)
// identityToken: Privy identity token (optional; backend fetches via Privy API if email missing)
// referralCode: optional invite code on first-login registration
export const privyLoginBodySchema = z.object({
  accessToken: z.string().trim().min(1, 'accessToken is required'),
  identityToken: z.string().trim().min(1).optional(),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,32}$/, 'referralCode must be 4-32 uppercase letters/numbers')
    .optional(),
});

// ── Passkey / WebAuthn ───────────────────────────────────────────────
// response: WebAuthn client JSON (browser/SDK-shaped; we only require an object)
// encryptedDek: DEK wrapped with passkey-PRF key; hex(32 bytes) = 64 hex chars
export const passkeyRegisterBodySchema = z.object({
  response: z.object({}).passthrough(),
  encryptedDek: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, 'encryptedDek must be hex(32 bytes) = 64 hex chars')
    .transform((v) => v.toLowerCase()),
});

export const passkeyAuthenticateBodySchema = z.object({
  response: z.object({}).passthrough(),
});

export const applyReferralCodeBodySchema = z.object({
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,32}$/, 'referralCode must be 4-32 uppercase letters/numbers'),
});

export const cashbackHistoryQuerySchema = z.object({
  status: z.enum(['pending', 'available', 'reversed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const withdrawCashbackBodySchema = z.object({
  amount: z.coerce.number().finite().min(0.01, 'amount must be at least 0.01'),
  destinationAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'destinationAddress must be a valid EVM address')
    .transform((v) => v.toLowerCase()),
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

// ── Phase 3 E2EE key pair (zero-access encryption) ──────────────────
// publicKey: base64(X25519 pubkey, 32 bytes) → fixed 44 chars with padding
// encryptedPrivateKey: client-defined base64 (KEK-wrapped private key)
// kekSalt: optional Passkey PRF salt for KEK (hex); stored only
export const keyPairBodySchema = z.object({
  publicKey: base64String
    .length(44, 'publicKey must be 44 base64 chars (32-byte X25519 key)'),
  encryptedPrivateKey: base64String
    .min(16, 'encryptedPrivateKey is too short')
    .max(2048, 'encryptedPrivateKey is too long'),
  kekSalt: hexString.optional(),
});
