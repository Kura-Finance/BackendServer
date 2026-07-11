import { Router } from 'express';
import {
  logout,
  me,
  updateProfile,
  updateAvatar,
  updateDisplayName,
  applyReferralCode,
  getMyCashbackHistory,
  deleteAccount,
} from './controllers/authController';
import { login } from './controllers/privyController';
import {
  setupKeyPair,
  getMyKeyPair,
  rotateKeyPair,
  resetE2EE,
} from './controllers/keyPairController';
import {
  status as passkeyStatus,
  list as passkeyList,
  remove as passkeyRemove,
  registerChallenge as passkeyRegisterChallenge,
  register as passkeyRegister,
  authenticateChallenge as passkeyAuthenticateChallenge,
  authenticate as passkeyAuthenticate,
} from './controllers/passkeyController';
import { requireAuth } from './middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  privyLoginBodySchema,
  updateDisplayNameBodySchema,
  updateAvatarBodySchema,
  updateProfileBodySchema,
  applyReferralCodeBodySchema,
  cashbackHistoryQuerySchema,
  keyPairBodySchema,
  passkeyRegisterBodySchema,
  passkeyAuthenticateBodySchema,
} from './schemas/authSchemas';

const router = Router();

/**
 * 認證路由
 *
 * 登入由 Privy 驅動：
 * - 前端用 Privy SDK 完成登入 → 取得 access token（+ identity token）
 * - POST /login 驗證後核發自有 JWT
 * - 網頁端：HttpOnly Cookie；行動端：回應 token 欄位（X-Client-Type 標頭區分）
 */

// ── Privy 登入（首次登入即註冊）──────────────────────────────────────
router.post('/login', validateRequest({ body: privyLoginBodySchema }), login);

// 登出與帳號維護
router.post('/logout', requireAuth, logout);

// ── Phase 3 E2EE Key Pair（Zero Access Encryption）──────────────────
// 使用者登入後生成 X25519 keypair，用 Passkey 推導的 KEK wrap privateKey 後上傳；
// 後端用 publicKey 包裝每次 sync 的 SEK，永遠無法解開使用者業務資料。
router.post('/keys/setup', requireAuth, validateRequest({ body: keyPairBodySchema }), setupKeyPair);    // { publicKey, encryptedPrivateKey, kekSalt? }
router.get('/keys/me', requireAuth, getMyKeyPair);                                                       // → { publicKey, encryptedPrivateKey, kekSalt, algorithm, createdAt }
router.post('/keys/rotate', requireAuth, validateRequest({ body: keyPairBodySchema }), rotateKeyPair);  // ⚠️ 會讓既有 wrappedSek 失效
router.post('/keys/reset', requireAuth, resetE2EE);                                                      // 換裝置/換 passkey：清掉 passkey + keypair + 加密快取，回到未設定狀態

// ── Passkey / WebAuthn（登入後解鎖 E2EE 資料層）───────────────────────
router.get('/passkey/status', requireAuth, passkeyStatus);                                                          // → { registered }
router.get('/passkey/register-challenge', requireAuth, passkeyRegisterChallenge);                                   // → WebAuthn registration options
router.post('/passkey/register', requireAuth, validateRequest({ body: passkeyRegisterBodySchema }), passkeyRegister); // { response, encryptedDek }
router.get('/passkey/authenticate-challenge', requireAuth, passkeyAuthenticateChallenge);                           // → WebAuthn authentication options
router.post('/passkey/authenticate', requireAuth, validateRequest({ body: passkeyAuthenticateBodySchema }), passkeyAuthenticate); // { response } → { encryptedDek }

// 使用者資料（需要認證）
router.get('/me', requireAuth, me);
router.get('/me/cashback-history', requireAuth, validateRequest({ query: cashbackHistoryQuerySchema }), getMyCashbackHistory); // 返現明細（pending/available/reversed）
router.patch('/me', requireAuth, validateRequest({ body: updateProfileBodySchema }), updateProfile);                              // 修改個人資料
router.post('/me/referral-code', requireAuth, validateRequest({ body: applyReferralCodeBodySchema }), applyReferralCode);       // 補填邀請碼（僅可一次）
router.patch('/me/avatar', requireAuth, validateRequest({ body: updateAvatarBodySchema }), updateAvatar);                      // 修改頭像
router.patch('/me/display-name', requireAuth, validateRequest({ body: updateDisplayNameBodySchema }), updateDisplayName);      // 修改顯示名稱
router.delete('/me', requireAuth, deleteAccount);

export default router;
