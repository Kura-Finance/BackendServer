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
 * 初始化環境配置
 */
export declare function initializeEnv(): void;
//# sourceMappingURL=env.d.ts.map