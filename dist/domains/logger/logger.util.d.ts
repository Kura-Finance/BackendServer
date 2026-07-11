/**
 * Logging helpers — most of these are intentionally no-ops.
 *
 * We want the runtime to be as close to silent as possible. The convenience
 * functions for operational telemetry (HTTP requests, DB ops, performance,
 * business / auth events, debug) are kept as exported symbols so the existing
 * call sites across the codebase keep compiling, but their bodies have been
 * stripped. Only `logError` actually emits, and `logStartup` prints a single
 * boot line.
 *
 * If a future feature genuinely needs structured logging, prefer adding a
 * dedicated, opt-in helper rather than reviving the old fan-out.
 */
type LogDetails = Record<string, unknown> | undefined;
export declare const logHttpRequest: (_method: string, _url: string, _statusCode: number, _duration: number, _userId?: string | number) => void;
export declare const logDatabaseOperation: (_operation: string, _table: string, _duration: number, _success: boolean, _error?: Error) => void;
export declare const logAuthEvent: (_event: "login" | "logout" | "register" | "failed_login" | "failed_register" | "password_reset_requested" | "failed_password_reset_request" | "password_reset_success" | "failed_password_reset" | "failed_send_verification" | "failed_email_verification" | "email_verified" | "password_reset_code_sent" | "failed_password_reset_code" | "password_reset_verified" | "verification_code_sent" | "failed_verification" | "verification_success" | "email_changed" | "password_change_success" | "failed_password_change", _userId?: string | number, _details?: LogDetails) => void;
export declare const logPerformance: (_operation: string, _duration: number, _threshold?: number) => void;
export declare const logBusinessEvent: (_event: string, _userId?: string | number, _details?: LogDetails) => void;
export declare const logDebug: (_message: string, _data?: LogDetails) => void;
export declare const logError: (message: string, error: Error | unknown, context?: Record<string, unknown>) => void;
export declare const logStartup: (serviceName: string, version: string, port?: number, protocol?: string) => void;
export {};
//# sourceMappingURL=logger.util.d.ts.map