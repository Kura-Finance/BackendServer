/**
 * Phase 3 zero-access E2EE crypto helpers.
 *
 * Scope:
 *   - User business-data E2EE only (Plaid tx / accounts / holdings,
 *     Exchange balances / assets, DeBank token / protocol, AssetSnapshot)
 *   - Backend secrets for third-party calls (Plaid accessToken, Exchange API
 *     keys, SRP verifier, webhook signing) stay in `shared/lib/encryption.ts`
 *     (`EncryptionUtil`) — out of scope here.
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
