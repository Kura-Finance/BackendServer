/**
 * HTTP 请求日志
 */
export declare const logHttpRequest: (method: string, url: string, statusCode: number, duration: number, userId?: string | number) => void;
/**
 * 数据库操作日志
 */
export declare const logDatabaseOperation: (operation: string, table: string, duration: number, success: boolean, error?: Error) => void;
/**
 * 认证事件日志
 */
export declare const logAuthEvent: (event: "login" | "logout" | "register" | "failed_login" | "failed_register" | "password_reset_requested" | "failed_password_reset_request" | "password_reset_success" | "failed_password_reset" | "failed_send_verification" | "failed_email_verification" | "email_verified" | "password_reset_code_sent" | "failed_password_reset_code" | "password_reset_verified" | "verification_code_sent" | "failed_verification" | "verification_success" | "email_changed", userId?: string | number, details?: Record<string, any>) => void;
/**
 * 错误日志
 */
export declare const logError: (message: string, error: Error | unknown, context?: Record<string, any>) => void;
/**
 * 性能监控日志
 */
export declare const logPerformance: (operation: string, duration: number, threshold?: number) => void;
/**
 * 业务事件日志
 */
export declare const logBusinessEvent: (event: string, userId?: string | number, details?: Record<string, any>) => void;
/**
 * 调试信息（仅在开发环境显示）
 */
export declare const logDebug: (message: string, data?: Record<string, any>) => void;
/**
 * 打印漂亮的启动信息
/**
 * 服務啟動日誌
 */
export declare const logStartup: (serviceName: string, version: string, port?: number, protocol?: string) => void;
//# sourceMappingURL=logger.util.d.ts.map