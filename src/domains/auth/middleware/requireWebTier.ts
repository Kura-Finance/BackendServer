/** Soft web-tier gate middleware (Pro / Ultimate vs Basic allowlist). */

import { Response, NextFunction } from 'express';
import { getUpgradeUrl } from '../../../config/brand';
import { getUserTier } from '../../shared/lib/apiRateLimitUtil';
import { sendError } from '../../shared/lib/apiResponse';
import {
  getRequestApiPath,
  isWebTierExemptPath,
  tierHasWebAccess,
} from '../../shared/lib/webTierAccess';
import { AuthRequest, resolveRequestAuth } from './auth';

/**
 * Soft gate: web clients need Pro / Ultimate for the full API.
 * Basic users may log in and hit allowlisted paths (profile, Stripe); others get 403.
 */
export async function webTierGate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const fullPath = getRequestApiPath(req.baseUrl, req.path);
  if (isWebTierExemptPath(fullPath)) {
    next();
    return;
  }

  resolveRequestAuth(req);

  if (!req.userId || req.clientType !== 'web') {
    next();
    return;
  }

  try {
    const tier = await getUserTier(req.userId);
    if (tierHasWebAccess(tier)) {
      next();
      return;
    }

    sendError(res, 403, {
      code: 'WEB_SUBSCRIPTION_REQUIRED',
      message: 'Web access requires Pro or Ultimate subscription.',
      details: {
        tier,
        requiredTiers: ['Pro', 'Ultimate'],
        upgrade: getUpgradeUrl(),
      },
    });
  } catch (error) {
    next(error);
  }
}
