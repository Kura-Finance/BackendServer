import { appLogger } from './logger';

/**
 * HTTP 請求日誌
 */
export const logHttpRequest = (method: string, url: string, statusCode: number, duration: number, userId?: string | number) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  (appLogger[level as keyof typeof appLogger] as any)(`${method} ${url} ${statusCode}`, {
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    userId: userId || 'anonymous',
  });
};

/**
 * 資料庫操作日誌
 */
export const logDatabaseOperation = (operation: string, table: string, duration: number, success: boolean, error?: Error) => {
  if (success) {
    appLogger.info(`Database operation: ${operation} on ${table}`, {
      operation,
      table,
      duration: `${duration}ms`,
    });
  } else {
    appLogger.error(`Database operation failed: ${operation} on ${table}`, {
      operation,
      table,
      duration: `${duration}ms`,
      error: error?.message,
      stack: error?.stack,
    });
  }
};

/**
 * 驗證事件日誌
 */
export const logAuthEvent = (event: 'login' | 'logout' | 'register' | 'failed_login' | 'failed_register' | 'password_reset_requested' | 'failed_password_reset_request' | 'password_reset_success' | 'failed_password_reset' | 'failed_send_verification' | 'failed_email_verification' | 'email_verified' | 'password_reset_code_sent' | 'failed_password_reset_code' | 'password_reset_verified' | 'verification_code_sent' | 'failed_verification' | 'verification_success' | 'email_changed' | 'password_change_success' | 'failed_password_change', userId?: string | number, details?: Record<string, any>) => {
  appLogger.info(`Auth event: ${event}`, {
    event,
    userId: userId || 'unknown',
    ...details,
  });
};

/**
 * 錯誤日誌
 */
export const logError = (message: string, error: Error | unknown, context?: Record<string, any>) => {
  if (error instanceof Error) {
    appLogger.error(message, {
      errorMessage: error.message,
      errorStack: error.stack,
      ...context,
    });
  } else {
    appLogger.error(message, {
      error: String(error),
      ...context,
    });
  }
};

/**
 * 效能監控日誌
 */
export const logPerformance = (operation: string, duration: number, threshold: number = 1000) => {
  const level = duration > threshold ? 'warn' : 'debug';
  (appLogger[level as keyof typeof appLogger] as any)(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    slow: duration > threshold,
  });
};

/**
 * 業務事件日誌
 */
export const logBusinessEvent = (event: string, userId?: string | number, details?: Record<string, any>) => {
  appLogger.info(`Business event: ${event}`, {
    event,
    userId: userId || 'unknown',
    timestamp: new Date().toISOString(),
    ...details,
  });
};

/**
 * 除錯資訊（僅在開發環境顯示）
 */
export const logDebug = (message: string, data?: Record<string, any>) => {
  appLogger.debug(message, data);
};

/**
 * 打印漂亮的启动信息
/**
 * 服務啟動日誌
 */
export const logStartup = (serviceName: string, version: string, port?: number, protocol?: string) => {
  const env = process.env.NODE_ENV || 'development';
  const protocolStr = protocol ? ` (${protocol})` : '';
  const portStr = port ? `\n║  Port: ${port}${protocolStr}` : '';
  appLogger.info(`
╔══════════════════════════════════════╗
║  ${serviceName} v${version}
║  Environment: ${env}${portStr}
╚══════════════════════════════════════╝
  `);
};
