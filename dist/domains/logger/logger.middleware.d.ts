import { Request, Response, NextFunction } from 'express';
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
export declare const httpLogger: (_req: Request, _res: Response, next: NextFunction) => void;
export declare const requestBodyLogger: (_req: Request, _res: Response, next: NextFunction) => void;
/**
 * Express error middleware — kept active because an unhandled error in a
 * request handler is exactly the kind of event we still want to see.
 */
export declare const errorLogger: (err: Error, req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=logger.middleware.d.ts.map