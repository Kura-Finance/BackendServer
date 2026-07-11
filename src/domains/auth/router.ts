import { Router } from 'express';
import { 
  requestRegisterToken, 
  confirmRegister, 
  login, 
  me, 
  updateAvatar,
  updateDisplayName,
  requestEmailChange,
  confirmEmailChange,
  requestPasswordReset, 
  resetPassword, 
  deleteAccount,
  sendVerificationCode,
  verifyEmailAndRegister,
  resendVerificationCode
} from './controllers/authController';
import { requireAuth } from './middleware/auth';

const router = Router();

/**
 * Auth Routes
 */

// 注册流程 (统一命名: send-code / verify / resend-code)
router.post('/register/send-code', sendVerificationCode);        // 发送验证码Email
router.post('/register/verify', verifyEmailAndRegister);         // 验证码 + 密码 完成注册
router.post('/register/resend-code', resendVerificationCode);    // 重新发送验证码

// 登录和密码重置 (统一使用邮件验证码模式)
router.post('/login', login);
router.post('/password-reset/send-code', requestPasswordReset);             // 发送重置码Email
router.post('/password-reset/verify', resetPassword);                   // 验证码 + 新密码 完成重置

// 用户资料（需要认证）
router.get('/me', requireAuth, me);
router.patch('/me/avatar', requireAuth, updateAvatar);           // 修改头像
router.patch('/me/display-name', requireAuth, updateDisplayName); // 修改显示名称
router.post('/me/email/request-change', requireAuth, requestEmailChange); // 请求修改邮箱（发送验证码）
router.post('/me/email/verify-change', requireAuth, confirmEmailChange); // 确认修改邮箱（验证码验证）
router.delete('/me', requireAuth, deleteAccount);

export default router;
