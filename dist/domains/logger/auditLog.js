"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditPlaid = exports.logAuditExchange = exports.logAuditDecryption = exports.logAuditEncryption = exports.AuditLogger = void 0;
const logger_1 = require("./logger");
/**
 * 审计日志记录器
 */
class AuditLogger {
    /**
     * 记录审计事件
     */
    static log(action, userId, status, options) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            level: options?.level || (status === 'FAILURE' ? 'ERROR' : 'INFO'),
            userId: userId || 'system',
            status,
        };
        // 只在可選欄位有值時才加入
        if (options?.resourceType)
            entry.resourceType = options.resourceType;
        if (options?.resourceId)
            entry.resourceId = options.resourceId;
        if (options?.duration)
            entry.duration = options.duration;
        if (options?.details)
            entry.details = options.details;
        if (options?.error)
            entry.error = options.error;
        if (options?.ipAddress)
            entry.ipAddress = options.ipAddress;
        if (options?.userAgent)
            entry.userAgent = options.userAgent;
        // 确定日志级别
        const logLevel = entry.level === 'ERROR' ? 'error' : entry.level === 'WARNING' ? 'warn' : 'info';
        // 格式化审计日志消息
        const message = `[AUDIT] ${action} - ${status}`;
        // 调用 Winston logger
        logger_1.appLogger[logLevel](message, entry);
    }
    /**
     * 记录加密操作
     */
    static logEncryption(dataType, status, userId, details, error, duration) {
        const action = `ENCRYPT_${dataType}`;
        const options = {
            level: 'INFO',
        };
        if (details)
            options.details = details;
        if (error)
            options.error = error;
        if (duration)
            options.duration = duration;
        this.log(action, userId, status, options);
    }
    /**
     * 记录解密操作
     */
    static logDecryption(dataType, status, userId, details, error, duration) {
        const action = `DECRYPT_${dataType}`;
        const options = {
            level: status === 'FAILURE' ? 'WARNING' : 'INFO',
        };
        if (details)
            options.details = details;
        if (error)
            options.error = error;
        if (duration)
            options.duration = duration;
        this.log(action, userId, status, options);
    }
    /**
     * 记录敏感操作 - 交易所
     */
    static logExchangeOperation(operation, userId, exchangeId, status, details, error, duration) {
        const actionMap = {
            CONNECT: 'CONNECT_EXCHANGE',
            DISCONNECT: 'DISCONNECT_EXCHANGE',
            FETCH_BALANCE: 'FETCH_EXCHANGE_BALANCE',
            FETCH_ASSETS: 'FETCH_EXCHANGE_ASSETS',
            FETCH_BALANCES_AND_ASSETS: 'FETCH_EXCHANGE_BALANCES_AND_ASSETS',
        };
        const options = {
            level: status === 'FAILURE' ? 'WARNING' : 'INFO',
            resourceType: 'EXCHANGE_ACCOUNT',
            resourceId: exchangeId,
            details: {
                exchange: details?.exchange,
                ...details,
            },
        };
        if (error)
            options.error = error;
        if (duration)
            options.duration = duration;
        this.log(actionMap[operation], userId, status, options);
    }
    /**
     * 记录敏感操作 - Plaid
     */
    static logPlaidOperation(operation, userId, status, resourceId, details, error, duration) {
        const actionMap = {
            EXCHANGE_TOKEN: 'EXCHANGE_PLAID_TOKEN',
            DISCONNECT: 'DISCONNECT_PLAID_ACCOUNT',
            FETCH_SNAPSHOT: 'FETCH_FINANCE_SNAPSHOT',
            FETCH_ACCOUNTS: 'FETCH_PLAID_ACCOUNTS',
            FETCH_TRANSACTIONS: 'FETCH_PLAID_TRANSACTIONS',
            FETCH_INVESTMENTS: 'FETCH_PLAID_INVESTMENTS',
        };
        const options = {
            level: status === 'FAILURE' ? 'WARNING' : 'INFO',
            resourceType: 'PLAID_ITEM',
            details: {
                institution: details?.institution,
                ...details,
            },
        };
        if (resourceId)
            options.resourceId = resourceId;
        if (error)
            options.error = error;
        if (duration)
            options.duration = duration;
        this.log(actionMap[operation], userId, status, options);
    }
    /**
     * 记录认证操作
     */
    static logAuthOperation(operation, userId, status, details, error) {
        const actionMap = {
            LOGIN: 'USER_LOGIN',
            LOGOUT: 'USER_LOGOUT',
            REGISTER: 'USER_REGISTER',
            PASSWORD_RESET: 'PASSWORD_RESET_COMPLETED',
            EMAIL_VERIFICATION: 'EMAIL_VERIFIED',
        };
        const options = {
            level: status === 'FAILURE' ? 'WARNING' : 'INFO',
            resourceType: 'USER',
            resourceId: userId,
        };
        if (details)
            options.details = details;
        if (error)
            options.error = error;
        this.log(actionMap[operation], userId, status, options);
    }
    /**
     * 记录密钥管理操作
     */
    static logKeyAccess(status, operation, details, error) {
        const action = status === 'FAILURE' ? 'ENCRYPTION_KEY_ERROR' : 'ENCRYPTION_KEY_ACCESS';
        const options = {
            level: status === 'FAILURE' ? 'ERROR' : 'WARNING',
            details: {
                operation,
                ...details,
            },
        };
        if (error)
            options.error = error;
        this.log(action, undefined, status, options);
    }
    /**
     * 记录通知系统操作
     */
    static logNotificationEvent(operation, userId, details, error) {
        const status = error ? 'FAILURE' : 'SUCCESS';
        const options = {
            level: status === 'FAILURE' ? 'WARNING' : 'INFO',
            resourceType: 'NOTIFICATION',
        };
        if (details)
            options.details = details;
        if (error)
            options.error = error;
        this.log(operation, userId, status, options);
    }
    /**
     * 生成审计日志摘要报告
     */
    static generateSummary(timeWindowMinutes = 60) {
        const now = new Date();
        const timeWindow = new Date(now.getTime() - timeWindowMinutes * 60000);
        return `
=== 审计日志摘要 (最后 ${timeWindowMinutes} 分钟) ===
生成时间: ${now.toISOString()}
时间窗口: ${timeWindow.toISOString()} 到 ${now.toISOString()}

注意: 详细日志请查看日志文件
    `;
    }
}
exports.AuditLogger = AuditLogger;
/**
 * 导出审计日志工具函数
 */
const logAuditEncryption = (dataType, status, userId, details, error, duration) => AuditLogger.logEncryption(dataType, status, userId, details, error, duration);
exports.logAuditEncryption = logAuditEncryption;
const logAuditDecryption = (dataType, status, userId, details, error, duration) => AuditLogger.logDecryption(dataType, status, userId, details, error, duration);
exports.logAuditDecryption = logAuditDecryption;
const logAuditExchange = (operation, userId, exchangeId, status, details, error, duration) => AuditLogger.logExchangeOperation(operation, userId, exchangeId, status, details, error, duration);
exports.logAuditExchange = logAuditExchange;
const logAuditPlaid = (operation, userId, status, resourceId, details, error, duration) => AuditLogger.logPlaidOperation(operation, userId, status, resourceId, details, error, duration);
exports.logAuditPlaid = logAuditPlaid;
//# sourceMappingURL=auditLog.js.map