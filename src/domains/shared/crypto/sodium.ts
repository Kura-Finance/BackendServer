/**
 * libsodium init and shared helpers.
 *
 * Always `await getSodium()` before any sodium op so wasm is ready.
 * This file only handles ready + base64/hex conversion; crypto lives in
 * sealedBox / sessionKey / payloadCipher.
 */

import sodium from 'libsodium-wrappers';

let readyPromise: Promise<typeof sodium> | null = null;

/**
 * Return an initialized libsodium instance.
 * First call awaits wasm ready; later calls reuse the same promise.
 */
export async function getSodium(): Promise<typeof sodium> {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
}

/** Uint8Array → standard base64 (with padding). */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** base64 → Uint8Array. */
export function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/** Uint8Array → hex. */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/** hex → Uint8Array. */
export function fromHex(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'hex'));
}

/**
 * Overwrite a buffer with zeros.
 *
 * Call after finishing with SEK / privateKey buffers to reduce heap-dump /
 * coredump leak risk. Best-effort only: JS GC may have copied the buffer
 * before the overwrite.
 */
export function zeroize(bytes: Uint8Array | undefined | null): void {
  if (!bytes) return;
  bytes.fill(0);
}
