/**
 * Auth middleware — JWT from Cookie (web) or Bearer (mobile).
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { appLogger } from '../../logger';
import { getJwtSecret } from '../../../config/env';

/** Express request augmented with auth fields after successful token parse. */
export interface AuthRequest extends Request {
  userId?: string;
  clientType?: 'web' | 'mobile'; // web: Cookie auth; mobile: JWT
}

function resolveClientType(
  req: AuthRequest,
  opts: { fromCookie: boolean; hasBearer: boolean },
): void {
  const headerClient = (req.headers['x-client-type'] as string)?.toLowerCase();

  if (opts.fromCookie) {
    req.clientType = 'web';
    return;
  }

  if (headerClient === 'web' || headerClient === 'mobile') {
    req.clientType = headerClient;
    return;
  }

  if (opts.hasBearer) {
    req.clientType = 'mobile';
  }
}

/**
 * Parse JWT from Cookie or Authorization; set req.userId / req.clientType.
 * @returns whether a valid token was parsed
 */
export function resolveRequestAuth(req: AuthRequest): boolean {
  if (req.userId) {
    return true;
  }

  let token: string | undefined = req.headers.authorization?.split(' ')[1];
  const fromCookie = !token && !!req.cookies?.authToken;

  if (fromCookie) {
    token = req.cookies.authToken;
  }

  resolveClientType(req, {
    fromCookie,
    hasBearer: !!req.headers.authorization?.startsWith('Bearer '),
  });

  if (!token) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = decoded.userId;
    return true;
  } catch {
    return false;
  }
}

/**
 * Auth middleware — two modes:
 * 1. Web: authToken Cookie (HttpOnly)
 * 2. Mobile: Authorization Bearer token
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.userId) {
    appLogger.debug('Token verified successfully', {
      userId: req.userId,
      clientType: req.clientType,
    });
    next();
    return;
  }

  let token: string | undefined = req.headers.authorization?.split(' ')[1];
  const fromCookie = !token && !!req.cookies?.authToken;
  if (fromCookie) {
    token = req.cookies.authToken;
  }

  if (!token) {
    appLogger.warn('Missing authorization token', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(401).json({ error: 'Authorization token not provided' });
    return;
  }

  resolveClientType(req, {
    fromCookie,
    hasBearer: !!req.headers.authorization?.startsWith('Bearer '),
  });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    req.userId = decoded.userId;
    appLogger.debug('Token verified successfully', {
      userId: req.userId,
      clientType: req.clientType,
    });
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    appLogger.warn('Token verification failed', {
      error: errorMessage,
      path: req.path,
      ip: req.ip,
    });
    res.status(401).json({ error: 'Token is invalid or expired' });
  }
};
