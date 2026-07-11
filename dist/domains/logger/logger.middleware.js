"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.requestBodyLogger = exports.httpLogger = void 0;
const logger_1 = require("./logger");
const logger_util_1 = require("./logger.util");
/**
 * HTTP 日志中间件
 * 记录所有请求和响应
 */
const httpLogger = (req, res, next) => {
    const startTime = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;
    // 拦截响应的 send 方法
    const originalSend = res.send;
    res.send = function (data) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const userId = req.userId || req.user?.id;
        (0, logger_util_1.logHttpRequest)(method, url, statusCode, duration, userId);
        // 调用原始 send 方法
        return originalSend.call(this, data);
    };
    next();
};
exports.httpLogger = httpLogger;
/**
 * 请求体日志中间件（用于调试）
 */
const requestBodyLogger = (req, res, next) => {
    if (process.env.LOG_LEVEL === 'debug') {
        logger_1.appLogger.debug('Incoming request', {
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
exports.requestBodyLogger = requestBodyLogger;
/**
 * 错误日志中间件
 */
const errorLogger = (err, req, res, next) => {
    const duration = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;
    const statusCode = res.statusCode || 500;
    const userId = req.userId || req.user?.id;
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