"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStartup = exports.logDebug = exports.logBusinessEvent = exports.logPerformance = exports.logError = exports.logAuthEvent = exports.logDatabaseOperation = exports.logHttpRequest = void 0;
const logger_1 = require("./logger");
/**
 * HTTP 請求日誌
 */
const logHttpRequest = (method, url, statusCode, duration, userId) => {
    const level = statusCode >= 400 ? 'warn' : 'info';
    logger_1.appLogger[level](`${method} ${url} ${statusCode}`, {
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
        userId: userId || 'anonymous',
    });
};
exports.logHttpRequest = logHttpRequest;
/**
 * 資料庫操作日誌
 */
const logDatabaseOperation = (operation, table, duration, success, error) => {
    if (success) {
        logger_1.appLogger.info(`Database operation: ${operation} on ${table}`, {
            operation,
            table,
            duration: `${duration}ms`,
        });
    }
    else {
        logger_1.appLogger.error(`Database operation failed: ${operation} on ${table}`, {
            operation,
            table,
            duration: `${duration}ms`,
            error: error?.message,
            stack: error?.stack,
        });
    }
};
exports.logDatabaseOperation = logDatabaseOperation;
/**
 * 驗證事件日誌
 */
const logAuthEvent = (event, userId, details) => {
    logger_1.appLogger.info(`Auth event: ${event}`, {
        event,
        userId: userId || 'unknown',
        ...details,
    });
};
exports.logAuthEvent = logAuthEvent;
/**
 * 錯誤日誌
 */
const logError = (message, error, context) => {
    if (error instanceof Error) {
        logger_1.appLogger.error(message, {
            errorMessage: error.message,
            errorStack: error.stack,
            ...context,
        });
    }
    else {
        logger_1.appLogger.error(message, {
            error: String(error),
            ...context,
        });
    }
};
exports.logError = logError;
/**
 * 效能監控日誌
 */
const logPerformance = (operation, duration, threshold = 1000) => {
    const level = duration > threshold ? 'warn' : 'debug';
    logger_1.appLogger[level](`Performance: ${operation}`, {
        operation,
        duration: `${duration}ms`,
        slow: duration > threshold,
    });
};
exports.logPerformance = logPerformance;
/**
 * 業務事件日誌
 */
const logBusinessEvent = (event, userId, details) => {
    logger_1.appLogger.info(`Business event: ${event}`, {
        event,
        userId: userId || 'unknown',
        timestamp: new Date().toISOString(),
        ...details,
    });
};
exports.logBusinessEvent = logBusinessEvent;
/**
 * 除錯資訊（僅在開發環境顯示）
 */
const logDebug = (message, data) => {
    logger_1.appLogger.debug(message, data);
};
exports.logDebug = logDebug;
/**
 * 打印漂亮的启动信息
/**
 * 服務啟動日誌
 */
const logStartup = (serviceName, version, port, protocol) => {
    const env = process.env.NODE_ENV || 'development';
    const protocolStr = protocol ? ` (${protocol})` : '';
    const portStr = port ? `\n║  Port: ${port}${protocolStr}` : '';
    logger_1.appLogger.info(`
╔══════════════════════════════════════╗
║  ${serviceName} v${version}
║  Environment: ${env}${portStr}
╚══════════════════════════════════════╝
  `);
};
exports.logStartup = logStartup;
//# sourceMappingURL=logger.util.js.map