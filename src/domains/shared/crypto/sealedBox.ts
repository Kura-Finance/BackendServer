/**
 * X25519 Sealed Box (匿名加密)。
 *
 * 用於用「使用者的 publicKey」加密一段內容（通常是 SEK）。
 * Sealed box 的特性：
 *   - 寄件人不需要自己的 keypair（一次性的 ephemeral key）
 *   - 收件人只需要 secretKey 就能解
 *   - 內含 authentication（XSalsa20-Poly1305）
 *
 * 後端用此函式 wrap SEK，前端用 crypto_box_seal_open 解開。
 *
 * 演算法 ID：`x25519-sealedbox+aes-256-gcm`
 *   - sealed box 本身是 X25519 + XSalsa20-Poly1305
 *   - 後綴 +aes-256-gcm 表示「被 wrap 的 SEK 是用來做 AES-256-GCM」
 */

import { getSodium, toBase64, fromBase64 } from './sodium';

/**
 * X25519 publicKey 的 base64 長度（32 bytes）。
 */
export const X25519_PUBLIC_KEY_BYTES = 32;

/**
 * 用使用者的 publicKey 把 SEK 加密成 wrappedSek（base64）。
 *
 * @param plaintext   要被 seal 的內容（通常是 32 bytes 的 SEK）
 * @param userPublicKeyB64  使用者的 X25519 publicKey（base64）
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
 * Sealed box 解封 — 後端**永遠不應該執行此函式**（後端沒有 privateKey）。
 *
 * 僅供測試 / 開發 / migration script 在持有 privateKey 的環境下使用。
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

/**
 * 簡單驗證 base64 publicKey 格式（不做密碼學驗證，僅檢查長度）。
 */
export function isValidPublicKeyB64(value: string): boolean {
  try {
    const decoded = fromBase64(value);
    return decoded.length === X25519_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}
