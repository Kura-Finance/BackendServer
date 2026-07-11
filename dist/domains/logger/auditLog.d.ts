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
export type AuditLevel = 'INFO' | 'WARNING' | 'ERROR';
export type AuditAction = 'ENCRYPT_EXCHANGE_CREDENTIAL' | 'DECRYPT_EXCHANGE_CREDENTIAL' | 'ENCRYPT_PLAID_TOKEN' | 'DECRYPT_PLAID_TOKEN' | 'CONNECT_EXCHANGE' | 'DISCONNECT_EXCHANGE' | 'FETCH_EXCHANGE_BALANCE' | 'FETCH_EXCHANGE_ASSETS' | 'FETCH_EXCHANGE_BALANCES_AND_ASSETS' | 'EXCHANGE_PLAID_TOKEN' | 'DISCONNECT_PLAID_ACCOUNT' | 'FETCH_FINANCE_SNAPSHOT' | 'FETCH_PLAID_ACCOUNTS' | 'FETCH_PLAID_TRANSACTIONS' | 'FETCH_PLAID_INVESTMENTS' | 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_REGISTER' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET_COMPLETED' | 'EMAIL_VERIFICATION_REQUESTED' | 'EMAIL_VERIFIED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED' | 'ENCRYPTION_KEY_ACCESS' | 'ENCRYPTION_KEY_ERROR';
interface AuditOptions {
    level?: AuditLevel;
    resourceType?: string;
    resourceId?: string;
    duration?: number;
    details?: Record<string, unknown>;
    error?: string;
    ipAddress?: string;
    userAgent?: string;
}
export declare class AuditLogger {
    static log(_action: AuditAction, _userId: string | undefined, _status: 'SUCCESS' | 'FAILURE', _options?: AuditOptions): void;
    static logEncryption(_dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN', _status: 'SUCCESS' | 'FAILURE', _userId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number): void;
    static logDecryption(_dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN', _status: 'SUCCESS' | 'FAILURE', _userId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number): void;
    static logExchangeOperation(_operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS' | 'FETCH_BALANCES_AND_ASSETS', _userId: string, _exchangeId: string, _status: 'SUCCESS' | 'FAILURE', _details?: Record<string, unknown>, _error?: string, _duration?: number): void;
    static logPlaidOperation(_operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS', _userId: string, _status: 'SUCCESS' | 'FAILURE', _resourceId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number): void;
    static logAuthOperation(_operation: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION', _userId: string | undefined, _status: 'SUCCESS' | 'FAILURE', _details?: Record<string, unknown>, _error?: string): void;
    static logKeyAccess(_status: 'SUCCESS' | 'FAILURE', _operation: string, _details?: Record<string, unknown>, _error?: string): void;
    static logNotificationEvent(_operation: 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED', _userId: string, _details?: Record<string, unknown>, _error?: string): void;
    static generateSummary(_timeWindowMinutes?: number): string;
}
export declare const logAuditEncryption: (_dataType: "EXCHANGE_CREDENTIAL" | "PLAID_TOKEN", _status: "SUCCESS" | "FAILURE", _userId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number) => void;
export declare const logAuditDecryption: (_dataType: "EXCHANGE_CREDENTIAL" | "PLAID_TOKEN", _status: "SUCCESS" | "FAILURE", _userId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number) => void;
export declare const logAuditExchange: (_operation: "CONNECT" | "DISCONNECT" | "FETCH_BALANCE" | "FETCH_ASSETS", _userId: string, _exchangeId: string, _status: "SUCCESS" | "FAILURE", _details?: Record<string, unknown>, _error?: string, _duration?: number) => void;
export declare const logAuditPlaid: (_operation: "EXCHANGE_TOKEN" | "DISCONNECT" | "FETCH_SNAPSHOT" | "FETCH_ACCOUNTS" | "FETCH_TRANSACTIONS" | "FETCH_INVESTMENTS", _userId: string, _status: "SUCCESS" | "FAILURE", _resourceId?: string, _details?: Record<string, unknown>, _error?: string, _duration?: number) => void;
export {};
//# sourceMappingURL=auditLog.d.ts.map