/**
 * Payload 加密的高階 API。
 *
 * 把任意 plain JS object 序列化（JSON.stringify）後用 SEK 加密，
 * 回傳一段 base64 字串（直接寫入 DB.payloadCiphertext 欄位）。
 *
 * 解密由前端負責 — 後端只負責封裝。
 */

import { encryptWithSEK, decryptWithSEK } from './sessionKey';

/**
 * 用 SEK 加密單一 payload object。
 */
export function encryptPayload<T>(sek: Uint8Array, obj: T): string {
  const json = JSON.stringify(obj);
  return encryptWithSEK(sek, json);
}

/**
 * 用 SEK 加密一個批次（同一把 SEK，逐筆 IV 不同）。
 */
export function encryptBatch<T>(sek: Uint8Array, items: T[]): string[] {
  return items.map((item) => encryptPayload(sek, item));
}

/**
 * 解密 — 僅供測試使用，後端生產不會執行。
 */
export function decryptPayload<T>(sek: Uint8Array, ciphertextB64: string): T {
  const json = decryptWithSEK(sek, ciphertextB64);
  return JSON.parse(json) as T;
}
