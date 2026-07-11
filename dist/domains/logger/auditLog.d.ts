/**
 * 审计日志级别
 */
export type AuditLevel = 'INFO' | 'WARNING' | 'ERROR';
/**
 * 审计操作类型
 */
export type AuditAction = 'ENCRYPT_EXCHANGE_CREDENTIAL' | 'DECRYPT_EXCHANGE_CREDENTIAL' | 'ENCRYPT_PLAID_TOKEN' | 'DECRYPT_PLAID_TOKEN' | 'CONNECT_EXCHANGE' | 'DISCONNECT_EXCHANGE' | 'FETCH_EXCHANGE_BALANCE' | 'FETCH_EXCHANGE_ASSETS' | 'FETCH_EXCHANGE_BALANCES_AND_ASSETS' | 'EXCHANGE_PLAID_TOKEN' | 'DISCONNECT_PLAID_ACCOUNT' | 'FETCH_FINANCE_SNAPSHOT' | 'FETCH_PLAID_ACCOUNTS' | 'FETCH_PLAID_TRANSACTIONS' | 'FETCH_PLAID_INVESTMENTS' | 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_REGISTER' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED' | 'EMAIL_VERIFICATION_REQUESTED' | 'EMAIL_VERIFIED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED' | 'ENCRYPTION_KEY_ACCESS' | 'ENCRYPTION_KEY_ERROR';
/**
 * 审计日志记录器
 */
export declare class AuditLogger {
    /**
     * 记录审计事件
     */
    static log(action: AuditAction, userId: string | undefined, status: 'SUCCESS' | 'FAILURE', options?: {
        level?: AuditLevel;
        resourceType?: string;
        resourceId?: string;
        duration?: number;
        details?: Record<string, any>;
        error?: string;
        ipAddress?: string;
        userAgent?: string;
    }): void;
    /**
     * 记录加密操作
     */
    static logEncryption(dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN', status: 'SUCCESS' | 'FAILURE', userId?: string, details?: Record<string, any>, error?: string, duration?: number): void;
    /**
     * 记录解密操作
     */
    static logDecryption(dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN', status: 'SUCCESS' | 'FAILURE', userId?: string, details?: Record<string, any>, error?: string, duration?: number): void;
    /**
     * 记录敏感操作 - 交易所
     */
    static logExchangeOperation(operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS' | 'FETCH_BALANCES_AND_ASSETS', userId: string, exchangeId: string, status: 'SUCCESS' | 'FAILURE', details?: Record<string, any>, error?: string, duration?: number): void;
    /**
     * 记录敏感操作 - Plaid
     */
    static logPlaidOperation(operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS', userId: string, status: 'SUCCESS' | 'FAILURE', resourceId?: string, details?: Record<string, any>, error?: string, duration?: number): void;
    /**
     * 记录认证操作
     */
    static logAuthOperation(operation: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION', userId: string | undefined, status: 'SUCCESS' | 'FAILURE', details?: Record<string, any>, error?: string): void;
    /**
     * 记录密钥管理操作
     */
    static logKeyAccess(status: 'SUCCESS' | 'FAILURE', operation: string, details?: Record<string, any>, error?: string): void;
    /**
     * 记录通知系统操作
     */
    static logNotificationEvent(operation: 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED', userId: string, details?: Record<string, any>, error?: string): void;
    /**
     * 生成审计日志摘要报告
     */
    static generateSummary(timeWindowMinutes?: number): string;
}
/**
 * 导出审计日志工具函数
 */
export declare const logAuditEncryption: (dataType: "EXCHANGE_CREDENTIAL" | "PLAID_TOKEN", status: "SUCCESS" | "FAILURE", userId?: string, details?: Record<string, any>, error?: string, duration?: number) => void;
export declare const logAuditDecryption: (dataType: "EXCHANGE_CREDENTIAL" | "PLAID_TOKEN", status: "SUCCESS" | "FAILURE", userId?: string, details?: Record<string, any>, error?: string, duration?: number) => void;
export declare const logAuditExchange: (operation: "CONNECT" | "DISCONNECT" | "FETCH_BALANCE" | "FETCH_ASSETS", userId: string, exchangeId: string, status: "SUCCESS" | "FAILURE", details?: Record<string, any>, error?: string, duration?: number) => void;
export declare const logAuditPlaid: (operation: "EXCHANGE_TOKEN" | "DISCONNECT" | "FETCH_SNAPSHOT" | "FETCH_ACCOUNTS" | "FETCH_TRANSACTIONS" | "FETCH_INVESTMENTS", userId: string, status: "SUCCESS" | "FAILURE", resourceId?: string, details?: Record<string, any>, error?: string, duration?: number) => void;
//# sourceMappingURL=auditLog.d.ts.map