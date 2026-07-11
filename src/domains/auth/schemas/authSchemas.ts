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

// ── Privy 登入 ───────────────────────────────────────────────────────
// accessToken：Privy access token（必填，登入權威證明）
// identityToken：Privy identity token（選填，解析 email + embedded wallet）
// referralCode：首次登入即註冊時可帶邀請碼
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
// response：WebAuthn 客戶端回傳的 JSON（結構由瀏覽器/SDK 決定，這裡只確認是物件）
// encryptedDek：用 passkey PRF 推導的金鑰包裝的 DEK，hex(32 bytes) = 64 hex chars
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

// ── Phase 3 E2EE Key Pair（Zero Access Encryption）────────────────────
// publicKey: base64(X25519 pubkey, 32 bytes) → 編碼後固定 44 字元（含 padding）
// encryptedPrivateKey: client 自由 base64 字串（KEK-wrapped private key）
// kekSalt: 選填，Passkey PRF 推導 KEK 用的 salt（hex）；後端僅儲存
export const keyPairBodySchema = z.object({
  publicKey: base64String
    .length(44, 'publicKey must be 44 base64 chars (32-byte X25519 key)'),
  encryptedPrivateKey: base64String
    .min(16, 'encryptedPrivateKey is too short')
    .max(2048, 'encryptedPrivateKey is too long'),
  kekSalt: hexString.optional(),
});
