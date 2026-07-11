"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("./controllers/authController");
const privyController_1 = require("./controllers/privyController");
const keyPairController_1 = require("./controllers/keyPairController");
const passkeyController_1 = require("./controllers/passkeyController");
const auth_1 = require("./middleware/auth");
const validateRequest_1 = require("../shared/middleware/validateRequest");
const authSchemas_1 = require("./schemas/authSchemas");
const router = (0, express_1.Router)();
/**
 * 認證路由
 *
 * 登入由 Privy 驅動：
 * - 前端用 Privy SDK 完成登入 → 取得 access token（+ identity token）
 * - POST /login 驗證後核發自有 JWT
 * - 網頁端：HttpOnly Cookie；行動端：回應 token 欄位（X-Client-Type 標頭區分）
 */
// ── Privy 登入（首次登入即註冊）──────────────────────────────────────
router.post('/login', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.privyLoginBodySchema }), privyController_1.login);
// 登出與帳號維護
router.post('/logout', auth_1.requireAuth, authController_1.logout);
// ── Phase 3 E2EE Key Pair（Zero Access Encryption）──────────────────
// 使用者登入後生成 X25519 keypair，用 Passkey 推導的 KEK wrap privateKey 後上傳；
// 後端用 publicKey 包裝每次 sync 的 SEK，永遠無法解開使用者業務資料。
router.post('/keys/setup', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.keyPairBodySchema }), keyPairController_1.setupKeyPair); // { publicKey, encryptedPrivateKey, kekSalt? }
router.get('/keys/me', auth_1.requireAuth, keyPairController_1.getMyKeyPair); // → { publicKey, encryptedPrivateKey, kekSalt, algorithm, createdAt }
router.post('/keys/rotate', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.keyPairBodySchema }), keyPairController_1.rotateKeyPair); // ⚠️ 會讓既有 wrappedSek 失效
router.post('/keys/reset', auth_1.requireAuth, keyPairController_1.resetE2EE); // 換裝置/換 passkey：清掉 passkey + keypair + 加密快取，回到未設定狀態
// ── Passkey / WebAuthn（登入後解鎖 E2EE 資料層）───────────────────────
router.get('/passkey/status', auth_1.requireAuth, passkeyController_1.status); // → { registered }
router.get('/passkey/register-challenge', auth_1.requireAuth, passkeyController_1.registerChallenge); // → WebAuthn registration options
router.post('/passkey/register', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.passkeyRegisterBodySchema }), passkeyController_1.register); // { response, encryptedDek }
router.get('/passkey/authenticate-challenge', auth_1.requireAuth, passkeyController_1.authenticateChallenge); // → WebAuthn authentication options
router.post('/passkey/authenticate', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.passkeyAuthenticateBodySchema }), passkeyController_1.authenticate); // { response } → { encryptedDek }
// 使用者資料（需要認證）
router.get('/me', auth_1.requireAuth, authController_1.me);
router.get('/me/cashback-history', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ query: authSchemas_1.cashbackHistoryQuerySchema }), authController_1.getMyCashbackHistory); // 返現明細（pending/available/reversed）
router.patch('/me', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateProfileBodySchema }), authController_1.updateProfile); // 修改個人資料
router.post('/me/referral-code', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.applyReferralCodeBodySchema }), authController_1.applyReferralCode); // 補填邀請碼（僅可一次）
router.patch('/me/avatar', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateAvatarBodySchema }), authController_1.updateAvatar); // 修改頭像
router.patch('/me/display-name', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateDisplayNameBodySchema }), authController_1.updateDisplayName); // 修改顯示名稱
router.delete('/me', auth_1.requireAuth, authController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=router.js.map