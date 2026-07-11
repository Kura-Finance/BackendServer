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

export type AuditAction =
  // 加密操作
  | 'ENCRYPT_EXCHANGE_CREDENTIAL'
  | 'DECRYPT_EXCHANGE_CREDENTIAL'
  | 'ENCRYPT_PLAID_TOKEN'
  | 'DECRYPT_PLAID_TOKEN'

  // 敏感操作 - 交易所
  | 'CONNECT_EXCHANGE'
  | 'DISCONNECT_EXCHANGE'
  | 'FETCH_EXCHANGE_BALANCE'
  | 'FETCH_EXCHANGE_ASSETS'
  | 'FETCH_EXCHANGE_BALANCES_AND_ASSETS'

  // 敏感操作 - Plaid
  | 'EXCHANGE_PLAID_TOKEN'
  | 'DISCONNECT_PLAID_ACCOUNT'
  | 'FETCH_FINANCE_SNAPSHOT'
  | 'FETCH_PLAID_ACCOUNTS'
  | 'FETCH_PLAID_TRANSACTIONS'
  | 'FETCH_PLAID_INVESTMENTS'

  // 敏感操作 - 认证
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_REGISTER'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'EMAIL_VERIFICATION_REQUESTED'
  | 'EMAIL_VERIFIED'

  // 通知系统
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_READ'
  | 'NOTIFICATION_DELETED'
  | 'NOTIFICATION_PREFERENCES_UPDATED'

  // 密钥管理
  | 'ENCRYPTION_KEY_ACCESS'
  | 'ENCRYPTION_KEY_ERROR';

// Shared option shape (kept for call-site type checking).
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

/* eslint-disable @typescript-eslint/no-unused-vars */

export class AuditLogger {
  static log(
    _action: AuditAction,
    _userId: string | undefined,
    _status: 'SUCCESS' | 'FAILURE',
    _options?: AuditOptions,
  ): void {
    /* intentionally silent */
  }

  static logEncryption(
    _dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
    _status: 'SUCCESS' | 'FAILURE',
    _userId?: string,
    _details?: Record<string, unknown>,
    _error?: string,
    _duration?: number,
  ): void {
    /* intentionally silent */
  }

  static logDecryption(
    _dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
    _status: 'SUCCESS' | 'FAILURE',
    _userId?: string,
    _details?: Record<string, unknown>,
    _error?: string,
    _duration?: number,
  ): void {
    /* intentionally silent */
  }

  static logExchangeOperation(
    _operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS' | 'FETCH_BALANCES_AND_ASSETS',
    _userId: string,
    _exchangeId: string,
    _status: 'SUCCESS' | 'FAILURE',
    _details?: Record<string, unknown>,
    _error?: string,
    _duration?: number,
  ): void {
    /* intentionally silent */
  }

  static logPlaidOperation(
    _operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS',
    _userId: string,
    _status: 'SUCCESS' | 'FAILURE',
    _resourceId?: string,
    _details?: Record<string, unknown>,
    _error?: string,
    _duration?: number,
  ): void {
    /* intentionally silent */
  }

  static logAuthOperation(
    _operation: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION',
    _userId: string | undefined,
    _status: 'SUCCESS' | 'FAILURE',
    _details?: Record<string, unknown>,
    _error?: string,
  ): void {
    /* intentionally silent */
  }

  static logKeyAccess(
    _status: 'SUCCESS' | 'FAILURE',
    _operation: string,
    _details?: Record<string, unknown>,
    _error?: string,
  ): void {
    /* intentionally silent */
  }

  static logNotificationEvent(
    _operation: 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED',
    _userId: string,
    _details?: Record<string, unknown>,
    _error?: string,
  ): void {
    /* intentionally silent */
  }

  static generateSummary(_timeWindowMinutes: number = 60): string {
    return '';
  }
}

// Functional wrappers retained for backward compatibility with any caller
// importing them directly. All are no-ops.

export const logAuditEncryption = (
  _dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
  _status: 'SUCCESS' | 'FAILURE',
  _userId?: string,
  _details?: Record<string, unknown>,
  _error?: string,
  _duration?: number,
): void => {
  /* intentionally silent */
};

export const logAuditDecryption = (
  _dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
  _status: 'SUCCESS' | 'FAILURE',
  _userId?: string,
  _details?: Record<string, unknown>,
  _error?: string,
  _duration?: number,
): void => {
  /* intentionally silent */
};

export const logAuditExchange = (
  _operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS',
  _userId: string,
  _exchangeId: string,
  _status: 'SUCCESS' | 'FAILURE',
  _details?: Record<string, unknown>,
  _error?: string,
  _duration?: number,
): void => {
  /* intentionally silent */
};

export const logAuditPlaid = (
  _operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS',
  _userId: string,
  _status: 'SUCCESS' | 'FAILURE',
  _resourceId?: string,
  _details?: Record<string, unknown>,
  _error?: string,
  _duration?: number,
): void => {
  /* intentionally silent */
};
