import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory IP rate limiter.
 * Mitigates API abuse; not a substitute for edge/WAF limits.
 */

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export interface RateLimiterConfig {
  windowMs?: number; // Window length in ms
  maxRequests?: number; // Max requests per window
}

/**
 * Build a rate-limit middleware.
 * @param config Optional window / max overrides
 * @returns Express middleware
 */
export function createRateLimiter(config: RateLimiterConfig = {}) {
  const windowMs = config.windowMs || 15 * 60 * 1000; // default 15 minutes
  const maxRequests = config.maxRequests || 1000; // default 1000 requests

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limits for Bridge / Stripe / Plaid server-to-server webhooks.
    // Shared egress IPs would otherwise exhaust a shared 429 and stall events.
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    if (pathOnly === '/webhook' || pathOnly.endsWith('/webhook')) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const now = Date.now();

    // Init or reset this IP's window
    if (!store[ip] || now > store[ip].resetTime) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[ip].count++;

    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', Math.max(0, (maxRequests - store[ip].count)).toString());
    res.setHeader('RateLimit-Reset', new Date(store[ip].resetTime).toISOString());

    if (store[ip].count > maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((store[ip].resetTime - now) / 1000),
      });
    }

    next();
  };
}

/** Default limiter: 1000 req / 15 min (shared IPs common on Cloud Run / NAT). */
export const rateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000,
});

/** Auth endpoints (login, etc.): 200 req / 15 min. */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
});

/** Strict limiter (e.g. waitlist): 100 req / 5 min. */
export const strictRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 100,
});

/** Lenient limiter (health checks, etc.): 300 req / 1 min. */
export const lenientRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  maxRequests: 300,
});
