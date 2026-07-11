import { appLogger } from './logger';

/**
 * 审计日志级别
 */
export type AuditLevel = 'INFO' | 'WARNING' | 'ERROR';

/**
 * 审计操作类型
 */
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

/**
 * 审计日志接口
 */
interface AuditLogEntry {
  timestamp: string;
  action: AuditAction;
  level: AuditLevel;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  status: 'SUCCESS' | 'FAILURE';
  duration?: number;
  details?: Record<string, any>;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 审计日志记录器
 */
export class AuditLogger {
  /**
   * 记录审计事件
   */
  static log(
    action: AuditAction,
    userId: string | undefined,
    status: 'SUCCESS' | 'FAILURE',
    options?: {
      level?: AuditLevel;
      resourceType?: string;
      resourceId?: string;
      duration?: number;
      details?: Record<string, any>;
      error?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      level: options?.level || (status === 'FAILURE' ? 'ERROR' : 'INFO'),
      userId: userId || 'system',
      status,
    };

    // 只在可選欄位有值時才加入
    if (options?.resourceType) entry.resourceType = options.resourceType;
    if (options?.resourceId) entry.resourceId = options.resourceId;
    if (options?.duration) entry.duration = options.duration;
    if (options?.details) entry.details = options.details;
    if (options?.error) entry.error = options.error;
    if (options?.ipAddress) entry.ipAddress = options.ipAddress;
    if (options?.userAgent) entry.userAgent = options.userAgent;

    // 确定日志级别
    const logLevel = entry.level === 'ERROR' ? 'error' : entry.level === 'WARNING' ? 'warn' : 'info';

    // 格式化审计日志消息
    const message = `[AUDIT] ${action} - ${status}`;

    // 调用 Winston logger
    (appLogger[logLevel as keyof typeof appLogger] as any)(message, entry);
  }

  /**
   * 记录加密操作
   */
  static logEncryption(
    dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
    status: 'SUCCESS' | 'FAILURE',
    userId?: string,
    details?: Record<string, any>,
    error?: string,
    duration?: number
  ): void {
    const action = `ENCRYPT_${dataType}` as AuditAction;
    const options: any = {
      level: 'INFO',
    };
    if (details) options.details = details;
    if (error) options.error = error;
    if (duration) options.duration = duration;
    this.log(action, userId, status, options);
  }

  /**
   * 记录解密操作
   */
  static logDecryption(
    dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
    status: 'SUCCESS' | 'FAILURE',
    userId?: string,
    details?: Record<string, any>,
    error?: string,
    duration?: number
  ): void {
    const action = `DECRYPT_${dataType}` as AuditAction;
    const options: any = {
      level: status === 'FAILURE' ? 'WARNING' : 'INFO',
    };
    if (details) options.details = details;
    if (error) options.error = error;
    if (duration) options.duration = duration;
    this.log(action, userId, status, options);
  }

  /**
   * 记录敏感操作 - 交易所
   */
  static logExchangeOperation(
    operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS' | 'FETCH_BALANCES_AND_ASSETS',
    userId: string,
    exchangeId: string,
    status: 'SUCCESS' | 'FAILURE',
    details?: Record<string, any>,
    error?: string,
    duration?: number
  ): void {
    const actionMap = {
      CONNECT: 'CONNECT_EXCHANGE',
      DISCONNECT: 'DISCONNECT_EXCHANGE',
      FETCH_BALANCE: 'FETCH_EXCHANGE_BALANCE',
      FETCH_ASSETS: 'FETCH_EXCHANGE_ASSETS',
      FETCH_BALANCES_AND_ASSETS: 'FETCH_EXCHANGE_BALANCES_AND_ASSETS',
    };

    const options: any = {
      level: status === 'FAILURE' ? 'WARNING' : 'INFO',
      resourceType: 'EXCHANGE_ACCOUNT',
      resourceId: exchangeId,
      details: {
        exchange: details?.exchange,
        ...details,
      },
    };
    if (error) options.error = error;
    if (duration) options.duration = duration;
    
    this.log(actionMap[operation] as AuditAction, userId, status, options);
  }

  /**
   * 记录敏感操作 - Plaid
   */
  static logPlaidOperation(
    operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS',
    userId: string,
    status: 'SUCCESS' | 'FAILURE',
    resourceId?: string,
    details?: Record<string, any>,
    error?: string,
    duration?: number
  ): void {
    const actionMap = {
      EXCHANGE_TOKEN: 'EXCHANGE_PLAID_TOKEN',
      DISCONNECT: 'DISCONNECT_PLAID_ACCOUNT',
      FETCH_SNAPSHOT: 'FETCH_FINANCE_SNAPSHOT',
      FETCH_ACCOUNTS: 'FETCH_PLAID_ACCOUNTS',
      FETCH_TRANSACTIONS: 'FETCH_PLAID_TRANSACTIONS',
      FETCH_INVESTMENTS: 'FETCH_PLAID_INVESTMENTS',
    };

    const options: any = {
      level: status === 'FAILURE' ? 'WARNING' : 'INFO',
      resourceType: 'PLAID_ITEM',
      details: {
        institution: details?.institution,
        ...details,
      },
    };
    if (resourceId) options.resourceId = resourceId;
    if (error) options.error = error;
    if (duration) options.duration = duration;

    this.log(actionMap[operation] as AuditAction, userId, status, options);
  }

  /**
   * 记录认证操作
   */
  static logAuthOperation(
    operation: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'PASSWORD_RESET' | 'EMAIL_VERIFICATION',
    userId: string | undefined,
    status: 'SUCCESS' | 'FAILURE',
    details?: Record<string, any>,
    error?: string
  ): void {
    const actionMap = {
      LOGIN: 'USER_LOGIN',
      LOGOUT: 'USER_LOGOUT',
      REGISTER: 'USER_REGISTER',
      PASSWORD_RESET: 'PASSWORD_RESET_COMPLETED',
      EMAIL_VERIFICATION: 'EMAIL_VERIFIED',
    };

    const options: any = {
      level: status === 'FAILURE' ? 'WARNING' : 'INFO',
      resourceType: 'USER',
      resourceId: userId,
    };
    if (details) options.details = details;
    if (error) options.error = error;

    this.log(actionMap[operation] as AuditAction, userId, status, options);
  }

  /**
   * 记录密钥管理操作
   */
  static logKeyAccess(
    status: 'SUCCESS' | 'FAILURE',
    operation: string,
    details?: Record<string, any>,
    error?: string
  ): void {
    const action = status === 'FAILURE' ? 'ENCRYPTION_KEY_ERROR' : 'ENCRYPTION_KEY_ACCESS';

    const options: any = {
      level: status === 'FAILURE' ? 'ERROR' : 'WARNING',
      details: {
        operation,
        ...details,
      },
    };
    if (error) options.error = error;

    this.log(action, undefined, status, options);
  }

  /**
   * 记录通知系统操作
   */
  static logNotificationEvent(
    operation: 'NOTIFICATION_SENT' | 'NOTIFICATION_READ' | 'NOTIFICATION_DELETED' | 'NOTIFICATION_PREFERENCES_UPDATED',
    userId: string,
    details?: Record<string, any>,
    error?: string
  ): void {
    const status = error ? 'FAILURE' : 'SUCCESS';
    const options: any = {
      level: status === 'FAILURE' ? 'WARNING' : 'INFO',
      resourceType: 'NOTIFICATION',
    };

    if (details) options.details = details;
    if (error) options.error = error;

    this.log(operation, userId, status, options);
  }

  /**
   * 生成审计日志摘要报告
   */
  static generateSummary(timeWindowMinutes: number = 60): string {
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

/**
 * 导出审计日志工具函数
 */
export const logAuditEncryption = (
  dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
  status: 'SUCCESS' | 'FAILURE',
  userId?: string,
  details?: Record<string, any>,
  error?: string,
  duration?: number
) => AuditLogger.logEncryption(dataType, status, userId, details, error, duration);

export const logAuditDecryption = (
  dataType: 'EXCHANGE_CREDENTIAL' | 'PLAID_TOKEN',
  status: 'SUCCESS' | 'FAILURE',
  userId?: string,
  details?: Record<string, any>,
  error?: string,
  duration?: number
) => AuditLogger.logDecryption(dataType, status, userId, details, error, duration);

export const logAuditExchange = (
  operation: 'CONNECT' | 'DISCONNECT' | 'FETCH_BALANCE' | 'FETCH_ASSETS',
  userId: string,
  exchangeId: string,
  status: 'SUCCESS' | 'FAILURE',
  details?: Record<string, any>,
  error?: string,
  duration?: number
) => AuditLogger.logExchangeOperation(operation, userId, exchangeId, status, details, error, duration);

export const logAuditPlaid = (
  operation: 'EXCHANGE_TOKEN' | 'DISCONNECT' | 'FETCH_SNAPSHOT' | 'FETCH_ACCOUNTS' | 'FETCH_TRANSACTIONS' | 'FETCH_INVESTMENTS',
  userId: string,
  status: 'SUCCESS' | 'FAILURE',
  resourceId?: string,
  details?: Record<string, any>,
  error?: string,
  duration?: number
) => AuditLogger.logPlaidOperation(operation, userId, status, resourceId, details, error, duration);
