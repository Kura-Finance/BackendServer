import { Router } from 'express';
import { joinWaitlist, getWaitlistCount, getWaitlistStatus } from './controllers/waitlistController';
import { validateRequest } from '../shared/middleware/validateRequest';
import { strictRateLimiter } from '../shared/middleware/rateLimiter';
import { joinWaitlistBodySchema, waitlistCountQuerySchema, waitlistStatusQuerySchema } from './schemas/waitlistSchemas';

/**
 * Public waitlist API.
 * Base path: /api/waitlist
 */

const router = Router();

/** GET /count — public waitlist signup total. */
router.get('/count', strictRateLimiter, validateRequest({ query: waitlistCountQuerySchema }), getWaitlistCount);

/** GET /status?email= — whether an email has already joined. */
router.get(
  '/status',
  strictRateLimiter,
  validateRequest({ query: waitlistStatusQuerySchema }),
  getWaitlistStatus,
);

/** POST / — public join form (no auth). */
router.post(
  '/',
  strictRateLimiter,
  validateRequest({ body: joinWaitlistBodySchema }),
  joinWaitlist,
);

export const waitlistRouter = router;
