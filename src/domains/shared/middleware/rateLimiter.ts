import { Request, Response, NextFunction } from 'express';

/**
 * 簡單的記憶體型速率限制（Rate Limiter）中間件
 * 使用 IP 位址進行限流，防止 API 被濫用或攻擊
 */

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// 預設配置
export interface RateLimiterConfig {
  windowMs?: number; // 時間窗口（毫秒）
  maxRequests?: number; // 時間窗口內最大請求數
}

/**
 * 創建速率限制中間件
 * @param config 配置選項
 * @returns Express 中間件函數
 */
export function createRateLimiter(config: RateLimiterConfig = {}) {
  const windowMs = config.windowMs || 15 * 60 * 1000; // 預設 15 分鐘
  const maxRequests = config.maxRequests || 1000; // 預設 1000 次請求

  return (req: Request, res: Response, next: NextFunction) => {
    // Bridge / Stripe / Plaid 等 server-to-server webhook 不限流。
    // 否則同一出口 IP 重試佇列會打爆共享 429，導致事件卡住。
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    if (pathOnly === '/webhook' || pathOnly.endsWith('/webhook')) {
      return next();
    }

    // 取得客戶端 IP 位址
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const now = Date.now();

    // 初始化或重設此 IP 的存取紀錄
    if (!store[ip] || now > store[ip].resetTime) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    // 增加計數
    store[ip].count++;

    // 設定 RateLimit 相關標頭
    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', Math.max(0, (maxRequests - store[ip].count)).toString());
    res.setHeader('RateLimit-Reset', new Date(store[ip].resetTime).toISOString());

    // 檢查是否超過限制
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

/**
 * 默認的速率限制中間件
 * 15 分鐘內最多 1000 次（Cloud Run / NAT 下多用戶常共 IP）
 */
export const rateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000,
});

/**
 * 認證相關速率限制（登入等）
 * 15 分鐘內最多 200 次
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 200,
});

/**
 * 嚴格的速率限制（例如 waitlist）
 * 5 分鐘內最多 100 次
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 100,
});

/**
 * 寬鬆的速率限制（健康檢查等）
 * 1 分鐘內最多 300 次
 */
export const lenientRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  maxRequests: 300,
});
