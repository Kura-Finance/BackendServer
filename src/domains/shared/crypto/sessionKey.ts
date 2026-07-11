/**
 * Session Encryption Key (SEK) 產生與 AES-256-GCM 對稱加密。
 *
 * 流程：
 *   1. 後端 sync 開始時呼叫 `generateSEK()` 拿一把隨機 32 bytes
 *   2. 用該 SEK 對所有 row 做 `encryptWithSEK`
 *   3. 把 SEK 用 sealedBox 包成 wrappedSek 存入 EncryptedPayloadKey
 *   4. **立即** `zeroize(sek)` 清除記憶體
 *
 * Ciphertext 格式（base64）：
 *   `{iv (12B)}{authTag (16B)}{ciphertext (?B)}` → base64
 *
 * 與前端 WebCrypto AES-GCM 互通：
 *   - iv 12 bytes
 *   - tag 16 bytes
 *   - WebCrypto 會把 tag 自動 append 到 ciphertext 尾巴；本格式則明確切出來
 *     （前端解時要把最後 16B 視為 tag）
 */

import crypto from 'crypto';
import { toBase64, fromBase64 } from './sodium';

const ALGORITHM = 'aes-256-gcm';
export const SEK_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * 產生一把全新的 SEK（32 bytes 隨機）。
 */
export function generateSEK(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(SEK_BYTES));
}

/**
 * 用 SEK 加密一段 UTF-8 字串。
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

  // Pack as iv | tag | ciphertext，前端按相同 layout 拆解
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return toBase64(new Uint8Array(packed));
}

/**
 * 用 SEK 解密 — 後端**永遠不應該執行此函式**（後端沒有 SEK）。
 *
 * 僅供測試 / 開發環境使用。
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
