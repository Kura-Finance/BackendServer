import { Router } from 'express';
import { joinWaitlist, getWaitlistCount, getWaitlistStatus } from './controllers/waitlistController';
import { validateRequest } from '../shared/middleware/validateRequest';
import { strictRateLimiter } from '../shared/middleware/rateLimiter';
import { joinWaitlistBodySchema, waitlistCountQuerySchema, waitlistStatusQuerySchema } from './schemas/waitlistSchemas';

/**
 * Waitlist 路由
 * 基礎路徑：/api/waitlist
 */
const router = Router();

/**
 * GET /api/waitlist/count
 * 公開：waitlist 總人數
 */
router.get('/count', strictRateLimiter, validateRequest({ query: waitlistCountQuerySchema }), getWaitlistCount);

/**
 * GET /api/waitlist/status?email=
 * 公開：查詢 email 是否已加入
 */
router.get(
  '/status',
  strictRateLimiter,
  validateRequest({ query: waitlistStatusQuerySchema }),
  getWaitlistStatus,
);

/**
 * POST /api/waitlist
 * 公開表單：加入 waitlist（不需登入）
 */
router.post(
  '/',
  strictRateLimiter,
  validateRequest({ body: joinWaitlistBodySchema }),
  joinWaitlist,
);

export const waitlistRouter = router;
