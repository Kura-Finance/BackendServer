"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
const client_1 = require("@prisma/client");
const logger_1 = require("../../logger");
/**
 * Prisma Client 單一實例
 * 參考 saori 的做法，集中管理數據庫連接
 * DATABASE_URL 必須在此模組載入前已設定 (透過 initializeEnv)
 */
exports.prisma = new client_1.PrismaClient();
/**
 * 初始化資料庫連線
 * - Migration 必須由 CI/CD 或部署流程執行 (prisma migrate deploy)
 * - 測試連接
 * - 記錄連接狀態
 */
async function initializeDatabase() {
    try {
        (0, logger_1.logDebug)('Initializing database connection...');
        const startTime = Date.now();
        // 建立連線並測試可用性
        await exports.prisma.$connect();
        await exports.prisma.$executeRaw `SELECT 1`;
        const duration = Date.now() - startTime;
        (0, logger_1.logDatabaseOperation)('Connection Test', 'system', duration, true);
        console.log('✅ Database connection successful');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, logger_1.logError)('Database initialization failed', error, {
            message: errorMessage,
        });
        console.error('❌ Database initialization failed:', errorMessage);
        throw error;
    }
}
/**
 * 優雅關閉數據庫連接
 */
async function closeDatabase() {
    try {
        await exports.prisma.$disconnect();
        console.log('📴 Database connection closed');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Error closing database connection:', errorMessage);
        (0, logger_1.logError)('Database disconnect error', error);
    }
}
/**
 * 全局錯誤處理：優雅關閉
 */
process.on('SIGTERM', async () => {
    console.log('💤 Received SIGTERM signal, closing database...');
    await closeDatabase();
});
process.on('SIGINT', async () => {
    console.log('💤 Received SIGINT signal, closing database...');
    await closeDatabase();
});
//# sourceMappingURL=database.js.map