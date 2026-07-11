/**
 * 構建 DATABASE_URL
 * 自動判斷 TCP（開發）或 Unix Socket（生產）
 */
export declare function buildDatabaseUrl(): string;
/**
 * 驗證必填環境變數
 */
export declare function validateEnvironment(): void;
/**
 * Single source of truth for reading `JWT_SECRET`.
 *
 * Returns the env value or throws if it is not configured. We must never fall
 * back to a literal default like `'secret'` — `validateEnvironment()` runs at
 * boot and exits the process if the var is missing, so any caller of this
 * helper after startup is guaranteed to get a real secret. The throw is a
 * defence-in-depth guard for code paths that bypass `initializeEnv()` (tests,
 * scripts, ad-hoc imports).
 */
export declare function getJwtSecret(): string;
/**
 * 初始化環境配置
 */
export declare function initializeEnv(): void;
//# sourceMappingURL=env.d.ts.map