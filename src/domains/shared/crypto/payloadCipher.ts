/**
 * High-level payload encryption API.
 *
 * JSON.stringify a plain object, encrypt with SEK, return a base64 string
 * suitable for DB.payloadCiphertext. Decryption is client-side — the backend
 * only seals.
 */

import { encryptWithSEK, decryptWithSEK } from './sessionKey';

/** Encrypt a single payload object with the SEK. */
export function encryptPayload<T>(sek: Uint8Array, obj: T): string {
  const json = JSON.stringify(obj);
  return encryptWithSEK(sek, json);
}

/** Encrypt a batch with one SEK (distinct IV per item). */
export function encryptBatch<T>(sek: Uint8Array, items: T[]): string[] {
  return items.map((item) => encryptPayload(sek, item));
}

/** Decrypt — tests only; not used in production backend. */
export function decryptPayload<T>(sek: Uint8Array, ciphertextB64: string): T {
  const json = decryptWithSEK(sek, ciphertextB64);
  return JSON.parse(json) as T;
}
