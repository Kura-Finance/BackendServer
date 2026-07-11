import { Router } from 'express';
import { 
  logout,
  me, 
  updateProfile,
  updateAvatar,
  updateDisplayName,
  requestEmailChange,
  confirmEmailChange,
  requestPasswordReset, 
  resetPassword, 
  deleteAccount,
  sendVerificationCode,
  verifyEmailAndRegister
} from './controllers/authController';
import {
  srpGetSalt,
  srpChallenge,
  srpVerify,
  srpSetup,
  srpDataKey,
  srpGenerateDataKeyDisabled,
} from './controllers/srpController';
import { requireAuth } from './middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  emailBodySchema,
  verifyEmailAndRegisterBodySchema,
  requestEmailChangeBodySchema,
  confirmEmailChangeBodySchema,
  updateDisplayNameBodySchema,
  updateAvatarBodySchema,
  updateProfileBodySchema,
  resetPasswordBodySchema,
  srpPayloadSchema,
  srpVerifyBodySchema,
} from './schemas/authSchemas';

const router = Router();

/**
 * 認證路由
 * 
 * 客戶端類型標識:
 * - 在請求標頭中加入 X-Client-Type: web 或 X-Client-Type: mobile
 * - 網頁端：使用 Cookie 認證 (HttpOnly, Secure, SameSite)
 * - 行動端：使用 JWT 認證 (從回應 token 欄位讀取)
 */

// 註冊流程（統一命名：send-code / verify）
router.post('/register/send-code', validateRequest({ body: emailBodySchema }), sendVerificationCode);                  // 發送驗證碼 Email
router.post('/register/verify', validateRequest({ body: verifyEmailAndRegisterBodySchema }), verifyEmailAndRegister); // 驗證碼 + SRP 資料完成註冊

// 登出與帳號維護
router.post('/logout', requireAuth, logout);                     // 登出 (清除 Cookie)
router.post('/password-reset/send-code', validateRequest({ body: emailBodySchema }), requestPasswordReset);  // 發送重置碼 Email
router.post('/password-reset/verify', validateRequest({ body: resetPasswordBodySchema }), resetPassword);    // 驗證碼 + SRP 資料完成重置

// ── SRP 零知識認證路由（第二階段）──────────────────────────────────
// 步驟 0：取得 salt（用戶端用於金鑰推導，不需要認證）
router.post('/srp/salt', validateRequest({ body: emailBodySchema }), srpGetSalt);                           // { email } → { srpSalt, kekSalt }
// 步驟 1：取得伺服器 challenge（挑戰值）
router.post('/srp/challenge', validateRequest({ body: emailBodySchema }), srpChallenge);                    // { email, clientA } → { sessionId, srpSalt, serverB, kekSalt, encryptedDataKey }
// 步驟 2：驗證用戶端 proof（證明值），完成登入
router.post('/srp/verify', validateRequest({ body: srpVerifyBodySchema }), srpVerify);                      // { sessionId, clientM1 } → { serverM2, token }
// 為現有帳號設定 SRP（首次升級或密碼變更）
router.post('/srp/setup', requireAuth, validateRequest({ body: srpPayloadSchema }), srpSetup);               // { srpSalt, srpVerifier, encryptedDataKey, kekSalt }
// 取得自己的加密 Data Key（登入後，用戶端用 KEK 解密）
router.get('/srp/data-key', requireAuth, srpDataKey);           // → { encryptedDataKey, kekSalt }
// 停用：Zero Access/Zero Knowledge 下不再由後端回傳明文 Data Key
router.post('/srp/generate-data-key', requireAuth, srpGenerateDataKeyDisabled);
// 使用者資料（需要認證）
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validateRequest({ body: updateProfileBodySchema }), updateProfile);                              // 修改個人資料
router.patch('/me/avatar', requireAuth, validateRequest({ body: updateAvatarBodySchema }), updateAvatar);                      // 修改頭像
router.patch('/me/display-name', requireAuth, validateRequest({ body: updateDisplayNameBodySchema }), updateDisplayName);      // 修改顯示名稱
router.post('/me/email/request-change', requireAuth, validateRequest({ body: requestEmailChangeBodySchema }), requestEmailChange); // 請求修改郵箱（發送驗證碼）
router.post('/me/email/verify-change', requireAuth, validateRequest({ body: confirmEmailChangeBodySchema }), confirmEmailChange);  // 確認修改郵箱（驗證碼驗證）
router.delete('/me', requireAuth, deleteAccount);

export default router;
