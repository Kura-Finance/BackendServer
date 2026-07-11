/**
 * Phase 3 Zero-Access E2EE 加密工具集。
 *
 * 邊界：
 *   - 本資料夾的工具僅服務於「使用者業務資料」端對端加密
 *     （Plaid 交易 / 帳戶 / 持倉、Exchange 餘額 / 資產、DeBank token / protocol、AssetSnapshot）
 *   - 後端**自己要呼叫第三方**用的 secret（Plaid accessToken、Exchange API keys、SRP verifier、
 *     Webhook signing）仍由 `shared/lib/encryption.ts` 的 `EncryptionUtil` 處理，不在此範圍。
 */

export { getSodium, toBase64, fromBase64, toHex, fromHex, zeroize } from './sodium';
export {
  sealForPublicKey,
  openSealedBox,
  isValidPublicKeyB64,
  X25519_PUBLIC_KEY_BYTES,
} from './sealedBox';
export {
  generateSEK,
  encryptWithSEK,
  decryptWithSEK,
  SEK_BYTES,
} from './sessionKey';
export {
  encryptPayload,
  encryptBatch,
  decryptPayload,
} from './payloadCipher';
