"use strict";
/**
 * Audit logging — intentionally no-op.
 *
 * The original implementation emitted an INFO/WARN/ERROR audit entry for
 * every sensitive operation (encryption / decryption, Plaid + exchange
 * calls, auth, key access, notifications). As part of the system-wide log
 * cleanup we keep the public surface (types, classes, function signatures)
 * so call sites compile unchanged, but every method now returns without
 * emitting anything.
 *
 * If a specific audit requirement comes back later, re-enable selectively
 * inside the corresponding method rather than restoring the whole fan-out.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditPlaid = exports.logAuditExchange = exports.logAuditDecryption = exports.logAuditEncryption = exports.AuditLogger = void 0;
/* eslint-disable @typescript-eslint/no-unused-vars */
class AuditLogger {
    static log(_action, _userId, _status, _options) {
        /* intentionally silent */
    }
    static logEncryption(_dataType, _status, _userId, _details, _error, _duration) {
        /* intentionally silent */
    }
    static logDecryption(_dataType, _status, _userId, _details, _error, _duration) {
        /* intentionally silent */
    }
    static logExchangeOperation(_operation, _userId, _exchangeId, _status, _details, _error, _duration) {
        /* intentionally silent */
    }
    static logPlaidOperation(_operation, _userId, _status, _resourceId, _details, _error, _duration) {
        /* intentionally silent */
    }
    static logAuthOperation(_operation, _userId, _status, _details, _error) {
        /* intentionally silent */
    }
    static logKeyAccess(_status, _operation, _details, _error) {
        /* intentionally silent */
    }
    static logNotificationEvent(_operation, _userId, _details, _error) {
        /* intentionally silent */
    }
    static generateSummary(_timeWindowMinutes = 60) {
        return '';
    }
}
exports.AuditLogger = AuditLogger;
// Functional wrappers retained for backward compatibility with any caller
// importing them directly. All are no-ops.
const logAuditEncryption = (_dataType, _status, _userId, _details, _error, _duration) => {
    /* intentionally silent */
};
exports.logAuditEncryption = logAuditEncryption;
const logAuditDecryption = (_dataType, _status, _userId, _details, _error, _duration) => {
    /* intentionally silent */
};
exports.logAuditDecryption = logAuditDecryption;
const logAuditExchange = (_operation, _userId, _exchangeId, _status, _details, _error, _duration) => {
    /* intentionally silent */
};
exports.logAuditExchange = logAuditExchange;
const logAuditPlaid = (_operation, _userId, _status, _resourceId, _details, _error, _duration) => {
    /* intentionally silent */
};
exports.logAuditPlaid = logAuditPlaid;
//# sourceMappingURL=auditLog.js.map