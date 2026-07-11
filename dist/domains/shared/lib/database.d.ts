import { PrismaClient } from '@prisma/client';
/**
 * Prisma Client 單一實例
 * 參考 saori 的做法，集中管理數據庫連接
 * DATABASE_URL 必須在此模組載入前已設定 (透過 initializeEnv)
 */
export declare const prisma: PrismaClient<import("@prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
/**
 * 初始化數據庫連接並同步 Schema
 * - 執行 Prisma 遷移 (自動建表)
 * - 測試連接
 * - 記錄連接狀態
 */
export declare function initializeDatabase(): Promise<void>;
/**
 * 優雅關閉數據庫連接
 */
export declare function closeDatabase(): Promise<void>;
//# sourceMappingURL=database.d.ts.map