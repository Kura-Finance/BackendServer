"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.requestBodyLogger = exports.httpLogger = void 0;
const logger_1 = require("./logger");
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
const httpLogger = (_req, _res, next) => {
    next();
};
exports.httpLogger = httpLogger;
const requestBodyLogger = (_req, _res, next) => {
    next();
};
exports.requestBodyLogger = requestBodyLogger;
/**
 * Express error middleware — kept active because an unhandled error in a
 * request handler is exactly the kind of event we still want to see.
 */
const errorLogger = (err, req, res, next) => {
    const method = req.method;
    const url = req.originalUrl || req.url;
    const statusCode = res.statusCode || 500;
    const userId = req.userId;
    logger_1.appLogger.error(`${method} ${url} - ${statusCode}`, {
        method,
        url,
        statusCode,
        userId: userId || 'anonymous',
        error: err.message,
        stack: err.stack,
    });
    next(err);
};
exports.errorLogger = errorLogger;
//# sourceMappingURL=logger.middleware.js.map