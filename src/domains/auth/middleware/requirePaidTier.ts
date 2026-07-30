/** Hard paid-tier gate middleware (Pro / Ultimate only). */

import { Response, NextFunction } from 'express';
import { getUserTier } from '../../shared/lib/apiRateLimitUtil';
import { sendError } from '../../shared/lib/apiResponse';
import { tierHasWebAccess } from '../../shared/lib/webTierAccess';
import { AuthRequest } from './auth';

/**
 * Hard gate: only Pro / Ultimate may pass (all clientTypes).
 * Must run after requireAuth.
 */
export async function requirePaidTier(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return;
  }

  try {
    const tier = await getUserTier(req.userId);
    if (tierHasWebAccess(tier)) {
      next();
      return;
    }

    sendError(res, 403, {
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'This feature requires Pro or Ultimate subscription.',
      details: {
        tier,
        requiredTiers: ['Pro', 'Ultimate'],
        upgrade: process.env.APP_UPGRADE_URL || 'https://kura-finance.com/pricing',
      },
    });
  } catch (error) {
    next(error);
  }
}
