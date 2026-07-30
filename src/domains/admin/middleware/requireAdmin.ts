/**
 * Admin email allowlist gate (ADMIN_EMAILS / ADMIN_EMAIL).
 */

import { Response, NextFunction } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { sendError } from '../../shared/lib/apiResponse';
import { AuthRequest } from '../../auth/middleware/auth';

/** Comma-separated allowlist; falls back to single ADMIN_EMAIL. */
export function getAdminEmailAllowlist(): Set<string> {
  const fromList = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromList.length > 0) {
    return new Set(fromList);
  }
  const single = (process.env.ADMIN_EMAIL || 'admin@kura-finance.com').trim().toLowerCase();
  return new Set(single ? [single] : []);
}

/**
 * Must run after requireAuth. Allows only users whose email is in ADMIN_EMAILS / ADMIN_EMAIL.
 */
export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    const email = user?.email?.trim().toLowerCase();
    if (!email || !getAdminEmailAllowlist().has(email)) {
      sendError(res, 403, {
        code: 'ADMIN_REQUIRED',
        message: 'Admin access required.',
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
