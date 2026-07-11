"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const logger_1 = require("../../logger");
/**
 * Prisma Client 單一實例
 * 參考 saori 的做法，集中管理數據庫連接
 * DATABASE_URL 必須在此模組載入前已設定 (透過 initializeEnv)
 */
exports.prisma = new client_1.PrismaClient();
/**
 * 初始化數據庫連接並同步 Schema
 * - 執行 Prisma 遷移 (自動建表)
 * - 測試連接
 * - 記錄連接狀態
 */
async function initializeDatabase() {
    try {
        (0, logger_1.logDebug)('Initializing database connection and syncing schema...');
        // 執行 Prisma 遷移來同步 Schema (如果表不存在就建表)
        try {
            console.log('🔄 Running Prisma migrations to sync database schema...');
            (0, child_process_1.execSync)('npx prisma migrate deploy', {
                cwd: process.cwd(),
                stdio: 'inherit',
                env: { ...process.env },
            });
            console.log('✅ Database schema synced successfully');
        }
        catch (migrateError) {
            // 如果遷移失敗，嘗試 db push (用於開發環境或新數據庫)
            (0, logger_1.logDebug)('Prisma migrate deploy failed, trying db push...', { error: migrateError });
            console.log('⚠️ Running prisma db push as fallback...');
            try {
                (0, child_process_1.execSync)('npx prisma db push --skip-generate', {
                    cwd: process.cwd(),
                    stdio: 'inherit',
                    env: { ...process.env },
                });
                console.log('✅ Database schema synced with db push');
            }
            catch (dbPushError) {
                (0, logger_1.logError)('Both Prisma migrate deploy and db push failed', dbPushError);
                throw dbPushError;
            }
        }
        const startTime = Date.now();
        // 測試連接
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