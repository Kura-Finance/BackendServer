/**
 * Session Encryption Key (SEK) generation and AES-256-GCM symmetric crypto.
 *
 * Flow:
 *   1. At sync start, call `generateSEK()` for a random 32-byte key
 *   2. Encrypt all rows with `encryptWithSEK`
 *   3. Seal the SEK into wrappedSek and store EncryptedPayloadKey
 *   4. Immediately `zeroize(sek)`
 *
 * Ciphertext layout (base64):
 *   `{iv (12B)}{authTag (16B)}{ciphertext (?B)}` → base64
 *
 * Interop with WebCrypto AES-GCM on the client:
 *   - iv 12 bytes
 *   - tag 16 bytes
 *   - WebCrypto appends the tag to ciphertext; this format splits it out
 *     (client must treat the last 16B as the tag when unpacking)
 */

import crypto from 'crypto';
import { toBase64, fromBase64 } from './sodium';

const ALGORITHM = 'aes-256-gcm';
export const SEK_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Generate a fresh SEK (32 random bytes). */
export function generateSEK(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(SEK_BYTES));
}

/**
 * Encrypt a UTF-8 string with the SEK.
 *
 * @returns base64(iv | tag | ciphertext)
 */
export function encryptWithSEK(sek: Uint8Array, plaintext: string): string {
  if (sek.length !== SEK_BYTES) {
    throw new Error(`Invalid SEK length: expected ${SEK_BYTES}, got ${sek.length}`);
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(sek), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack as iv | tag | ciphertext; client unpacks the same layout
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return toBase64(new Uint8Array(packed));
}

/**
 * Decrypt with SEK — the backend must never call this in production
 * (it does not hold SEKs). For tests / local development only.
 */
export function decryptWithSEK(sek: Uint8Array, packedB64: string): string {
  if (sek.length !== SEK_BYTES) {
    throw new Error(`Invalid SEK length: expected ${SEK_BYTES}, got ${sek.length}`);
  }

  const packed = Buffer.from(fromBase64(packedB64));
  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid packed ciphertext: too short');
  }

  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(sek), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
