import { Request, Response, NextFunction } from 'express';
import { appLogger } from './logger';
import { logHttpRequest } from './logger.util';

/**
 * HTTP 日志中间件
 * 记录所有请求和响应
 */
export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // 拦截响应的 send 方法
  const originalSend = res.send;
  res.send = function (data: any) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const userId = (req as any).userId || (req as any).user?.id;

    logHttpRequest(method, url, statusCode, duration, userId);

    // 调用原始 send 方法
    return originalSend.call(this, data);
  };

  next();
};

/**
 * 请求体日志中间件（用于调试）
 */
export const requestBodyLogger = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.LOG_LEVEL === 'debug') {
    appLogger.debug('Incoming request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      body: req.body,
      query: req.query,
    });
  }
  next();
};

/**
 * 错误日志中间件
 */
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const duration = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const statusCode = res.statusCode || 500;
  const userId = (req as any).userId || (req as any).user?.id;

  appLogger.error(`${method} ${url} - ${statusCode}`, {
    method,
    url,
    statusCode,
    userId: userId || 'anonymous',
    error: err.message,
    stack: err.stack,
  });

  next(err);
};
