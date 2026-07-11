"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("./controllers/authController");
const auth_1 = require("./middleware/auth");
const router = (0, express_1.Router)();
/**
 * Auth Routes
 */
// 注册流程 (统一命名: send-code / verify / resend-code)
router.post('/register/send-code', authController_1.sendVerificationCode); // 发送验证码Email
router.post('/register/verify', authController_1.verifyEmailAndRegister); // 验证码 + 密码 完成注册
router.post('/register/resend-code', authController_1.resendVerificationCode); // 重新发送验证码
// 登录和密码重置 (统一使用邮件验证码模式)
router.post('/login', authController_1.login);
router.post('/password-reset/send-code', authController_1.requestPasswordReset); // 发送重置码Email
router.post('/password-reset/verify', authController_1.resetPassword); // 验证码 + 新密码 完成重置
// 用户资料（需要认证）
router.get('/me', auth_1.requireAuth, authController_1.me);
router.patch('/me/avatar', auth_1.requireAuth, authController_1.updateAvatar); // 修改头像
router.patch('/me/display-name', auth_1.requireAuth, authController_1.updateDisplayName); // 修改显示名称
router.post('/me/email/request-change', auth_1.requireAuth, authController_1.requestEmailChange); // 请求修改邮箱（发送验证码）
router.post('/me/email/verify-change', auth_1.requireAuth, authController_1.confirmEmailChange); // 确认修改邮箱（验证码验证）
router.delete('/me', auth_1.requireAuth, authController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=router.js.map