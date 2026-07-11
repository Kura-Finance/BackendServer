"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("./controllers/authController");
const srpController_1 = require("./controllers/srpController");
const auth_1 = require("./middleware/auth");
const validateRequest_1 = require("../shared/middleware/validateRequest");
const authSchemas_1 = require("./schemas/authSchemas");
const router = (0, express_1.Router)();
/**
 * 認證路由
 *
 * 客戶端類型標識:
 * - 在請求標頭中加入 X-Client-Type: web 或 X-Client-Type: mobile
 * - 網頁端：使用 Cookie 認證 (HttpOnly, Secure, SameSite)
 * - 行動端：使用 JWT 認證 (從回應 token 欄位讀取)
 */
// 註冊流程（統一命名：send-code / verify）
router.post('/register/send-code', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.emailBodySchema }), authController_1.sendVerificationCode); // 發送驗證碼 Email
router.post('/register/verify', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.verifyEmailAndRegisterBodySchema }), authController_1.verifyEmailAndRegister); // 驗證碼 + SRP 資料完成註冊
// 登出與帳號維護
router.post('/logout', auth_1.requireAuth, authController_1.logout); // 登出 (清除 Cookie)
router.post('/password-reset/send-code', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.emailBodySchema }), authController_1.requestPasswordReset); // 發送重置碼 Email
router.post('/password-reset/verify', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.resetPasswordBodySchema }), authController_1.resetPassword); // 驗證碼 + SRP 資料完成重置
// ── SRP 零知識認證路由（第二階段）──────────────────────────────────
// 步驟 0：取得 salt（用戶端用於金鑰推導，不需要認證）
router.post('/srp/salt', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.emailBodySchema }), srpController_1.srpGetSalt); // { email } → { srpSalt, kekSalt }
// 步驟 1：取得伺服器 challenge（挑戰值）
router.post('/srp/challenge', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.emailBodySchema }), srpController_1.srpChallenge); // { email, clientA } → { sessionId, srpSalt, serverB, kekSalt, encryptedDataKey }
// 步驟 2：驗證用戶端 proof（證明值），完成登入
router.post('/srp/verify', (0, validateRequest_1.validateRequest)({ body: authSchemas_1.srpVerifyBodySchema }), srpController_1.srpVerify); // { sessionId, clientM1 } → { serverM2, token }
// 為現有帳號設定 SRP（首次升級或密碼變更）
router.post('/srp/setup', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.srpPayloadSchema }), srpController_1.srpSetup); // { srpSalt, srpVerifier, encryptedDataKey, kekSalt }
// 取得自己的加密 Data Key（登入後，用戶端用 KEK 解密）
router.get('/srp/data-key', auth_1.requireAuth, srpController_1.srpDataKey); // → { encryptedDataKey, kekSalt }
// 停用：Zero Access/Zero Knowledge 下不再由後端回傳明文 Data Key
router.post('/srp/generate-data-key', auth_1.requireAuth, srpController_1.srpGenerateDataKeyDisabled);
// 使用者資料（需要認證）
router.get('/me', auth_1.requireAuth, authController_1.me);
router.patch('/me', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateProfileBodySchema }), authController_1.updateProfile); // 修改個人資料
router.patch('/me/avatar', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateAvatarBodySchema }), authController_1.updateAvatar); // 修改頭像
router.patch('/me/display-name', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.updateDisplayNameBodySchema }), authController_1.updateDisplayName); // 修改顯示名稱
router.post('/me/email/request-change', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.requestEmailChangeBodySchema }), authController_1.requestEmailChange); // 請求修改郵箱（發送驗證碼）
router.post('/me/email/verify-change', auth_1.requireAuth, (0, validateRequest_1.validateRequest)({ body: authSchemas_1.confirmEmailChangeBodySchema }), authController_1.confirmEmailChange); // 確認修改郵箱（驗證碼驗證）
router.delete('/me', auth_1.requireAuth, authController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=router.js.map