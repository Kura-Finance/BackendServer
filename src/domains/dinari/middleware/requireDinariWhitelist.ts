import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError } from '../../shared/lib/apiResponse';
import { isDinariWhitelistedUser } from '../lib/dinariWhitelist';

/**
 * Dinari Entity / KYC 白名單 gate。
 * 非白名單用戶回 403，避免前端觸發 Dinari entity 註冊與 KYC flow。
 */
export async function requireDinariWhitelist(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return;
  }

  if (await isDinariWhitelistedUser(req.userId)) {
    next();
    return;
  }

  sendError(res, 403, {
    code: 'DINARI_NOT_WHITELISTED',
    message: 'this user not in whitelist',
  });
}
