/** Middleware: gate Dinari Entity / KYC routes to whitelisted users. */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError } from '../../shared/lib/apiResponse';
import { isDinariWhitelistedUser } from '../lib/dinariWhitelist';

/**
 * Dinari Entity / KYC whitelist gate.
 * Non-whitelisted users get 403 so the client cannot start entity registration / KYC.
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
