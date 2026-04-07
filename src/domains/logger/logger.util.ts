import { appLogger } from './logger';

/**
 * HTTP 请求日志
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
 * 数据库操作日志
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
 * 认证事件日志
 */
export const logAuthEvent = (event: 'login' | 'logout' | 'register' | 'failed_login' | 'failed_register', userId?: string | number, details?: Record<string, any>) => {
  appLogger.info(`Auth event: ${event}`, {
    event,
    userId: userId || 'unknown',
    ...details,
  });
};

/**
 * 错误日志
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
 * 性能监控日志
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
 * 业务事件日志
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
 * 调试信息（仅在开发环境显示）
 */
export const logDebug = (message: string, data?: Record<string, any>) => {
  appLogger.debug(message, data);
};

/**
 * 打印漂亮的启动信息
 */
export const logStartup = (serviceName: string, version: string, port?: number) => {
  const env = process.env.NODE_ENV || 'development';
  appLogger.info(`
╔══════════════════════════════════════╗
║  ${serviceName} v${version}
║  Environment: ${env}
║  ${port ? `Port: ${port}` : ''}
╚══════════════════════════════════════╝
  `);
};
