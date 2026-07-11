import { Request, Response, NextFunction } from 'express';
import { appLogger } from './logger';

/**
 * HTTP / request-body middlewares.
 *
 * These used to log every request, response status, and body shape. They are
 * now pure pass-throughs: HTTP access logs are emitted by the platform
 * (Cloud Run / load balancer) and we don't want app-level duplication that
 * also has to be redacted for secrets.
 *
 * Kept exported so existing `app.use(httpLogger)` / `app.use(requestBodyLogger)`
 * call sites in `index.ts` keep compiling without churn.
 */
export const httpLogger = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

export const requestBodyLogger = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

/**
 * Express error middleware — kept active because an unhandled error in a
 * request handler is exactly the kind of event we still want to see.
 */
export const errorLogger = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const method = req.method;
  const url = req.originalUrl || req.url;
  const statusCode = res.statusCode || 500;
  const userId = (req as Request & { userId?: string }).userId;

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
