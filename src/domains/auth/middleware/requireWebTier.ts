import { Response, NextFunction } from 'express';
import { getUserTier } from '../../shared/lib/apiRateLimitUtil';
import { sendError } from '../../shared/lib/apiResponse';
import {
  getRequestApiPath,
  isWebTierExemptPath,
  tierHasWebAccess,
} from '../../shared/lib/webTierAccess';
import { AuthRequest, resolveRequestAuth } from './auth';

/**
 * Soft gate：Web 客戶端僅 Pro / Ultimate 可使用完整 API。
 * Basic 用戶可登入並存取白名單路徑（profile、Stripe 付費），其餘回 403。
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
        upgrade: process.env.APP_UPGRADE_URL || 'https://kura-finance.com/pricing',
      },
    });
  } catch (error) {
    next(error);
  }
}
