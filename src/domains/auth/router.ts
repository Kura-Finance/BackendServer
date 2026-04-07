import { Router } from 'express';
import { register, login, me, updateProfile } from './controllers/authController';
import { requireAuth } from './middleware/auth';

const router = Router();

/**
 * Auth Routes
 */

// 注册和登录（不需要认证）
router.post('/register', register);
router.post('/login', login);

// 用户资料（需要认证）
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateProfile);

export default router;
