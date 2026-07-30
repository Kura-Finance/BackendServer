/**
 * X25519 sealed box (anonymous encryption).
 *
 * Encrypts a payload (usually an SEK) to the user's publicKey.
 * Sealed-box properties:
 *   - Sender needs no keypair (ephemeral key)
 *   - Recipient needs only the secretKey
 *   - Authenticated (XSalsa20-Poly1305)
 *
 * Backend wraps SEKs with this; client opens with crypto_box_seal_open.
 *
 * Algorithm ID: `x25519-sealedbox+aes-256-gcm`
 *   - sealed box itself is X25519 + XSalsa20-Poly1305
 *   - `+aes-256-gcm` means the wrapped SEK is for AES-256-GCM
 */

import { getSodium, toBase64, fromBase64 } from './sodium';

/** X25519 publicKey size in bytes (32). */
export const X25519_PUBLIC_KEY_BYTES = 32;

/**
 * Seal plaintext to the user's publicKey as wrappedSek (base64).
 *
 * @param plaintext          Content to seal (usually a 32-byte SEK)
 * @param userPublicKeyB64   User's X25519 publicKey (base64)
 * @returns base64(crypto_box_seal output)
 */
export async function sealForPublicKey(
  plaintext: Uint8Array,
  userPublicKeyB64: string,
): Promise<string> {
  const sodium = await getSodium();

  const publicKey = fromBase64(userPublicKeyB64);
  if (publicKey.length !== X25519_PUBLIC_KEY_BYTES) {
    throw new Error(
      `Invalid X25519 public key length: expected ${X25519_PUBLIC_KEY_BYTES}, got ${publicKey.length}`,
    );
  }

  const sealed = sodium.crypto_box_seal(plaintext, publicKey);
  return toBase64(sealed);
}

/**
 * Open a sealed box — the backend must never call this in production
 * (it has no privateKey). For tests / migration scripts that hold a privateKey.
 */
export async function openSealedBox(
  sealedB64: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  const sealed = fromBase64(sealedB64);
  const opened = sodium.crypto_box_seal_open(sealed, publicKey, privateKey);
  if (!opened) {
    throw new Error('Failed to open sealed box');
  }
  return opened;
}

/** Lightweight base64 publicKey format check (length only, not crypto validation). */
export function isValidPublicKeyB64(value: string): boolean {
  try {
    const decoded = fromBase64(value);
    return decoded.length === X25519_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}
