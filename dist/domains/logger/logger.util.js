"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStartup = exports.logError = exports.logDebug = exports.logBusinessEvent = exports.logPerformance = exports.logAuthEvent = exports.logDatabaseOperation = exports.logHttpRequest = void 0;
const logger_1 = require("./logger");
// ── No-op helpers ──────────────────────────────────────────────────
const logHttpRequest = (_method, _url, _statusCode, _duration, _userId) => {
    /* intentionally silent */
};
exports.logHttpRequest = logHttpRequest;
const logDatabaseOperation = (_operation, _table, _duration, _success, _error) => {
    /* intentionally silent */
};
exports.logDatabaseOperation = logDatabaseOperation;
const logAuthEvent = (_event, _userId, _details) => {
    /* intentionally silent */
};
exports.logAuthEvent = logAuthEvent;
const logPerformance = (_operation, _duration, _threshold = 1000) => {
    /* intentionally silent */
};
exports.logPerformance = logPerformance;
const logBusinessEvent = (_event, _userId, _details) => {
    /* intentionally silent */
};
exports.logBusinessEvent = logBusinessEvent;
const logDebug = (_message, _data) => {
    /* intentionally silent */
};
exports.logDebug = logDebug;
// ── Error logging (kept active) ────────────────────────────────────
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
// ── Startup banner (single line, kept for operator visibility) ─────
const logStartup = (serviceName, version, port, protocol) => {
    const env = process.env.NODE_ENV || 'development';
    const protocolStr = protocol ? ` (${protocol})` : '';
    const portStr = port ? ` on :${port}${protocolStr}` : '';
    // Emit at warn so it shows up under the default log level (warn).
    logger_1.appLogger.warn(`${serviceName} v${version} [${env}] started${portStr}`);
};
exports.logStartup = logStartup;
//# sourceMappingURL=logger.util.js.map