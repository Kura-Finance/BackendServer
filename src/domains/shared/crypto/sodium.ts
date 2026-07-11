/**
 * libsodium 初始化與共用 helper。
 *
 * 在後端任何 sodium 操作之前都必須先 `await getSodium()` 確保 wasm 已 ready。
 *
 * 本檔案僅做 ready 控制 + base64 / hex 轉換，密碼學運算放在 sealedBox / sessionKey / payloadCipher。
 */

import sodium from 'libsodium-wrappers';

let readyPromise: Promise<typeof sodium> | null = null;

/**
 * 取得已初始化的 libsodium 實例。
 * 第一次呼叫時會等待 wasm ready，之後每次都回傳同一個 promise。
 */
export async function getSodium(): Promise<typeof sodium> {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
}

/**
 * Uint8Array → base64（標準 base64，含 padding）。
 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * base64 → Uint8Array。
 */
export function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/**
 * Uint8Array → hex。
 */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * hex → Uint8Array。
 */
export function fromHex(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'hex'));
}

/**
 * 把記憶體中的 buffer 全部覆寫為 0。
 *
 * 用於 SEK / privateKey 等敏感 buffer 用完後立即清除，
 * 降低 heap dump / coredump 洩漏風險。
 *
 * 注意：JS 的 GC 可能在覆寫前已經把 buffer 複製到別處，
 * 這只能盡力而為，不是強保證。
 */
export function zeroize(bytes: Uint8Array | undefined | null): void {
  if (!bytes) return;
  bytes.fill(0);
}
