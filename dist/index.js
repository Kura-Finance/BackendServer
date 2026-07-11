"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const database_1 = require("./domains/shared/lib/database");
const auth_1 = require("./domains/auth");
const plaid_1 = require("./domains/plaid");
const asset_1 = require("./domains/asset");
const exchange_1 = require("./domains/exchange");
const notification_1 = require("./domains/notification");
const logger_1 = require("./domains/logger");
// ========================================
// 1. 初始化環境變數和數據庫 URL
// ========================================
(0, env_1.initializeEnv)();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 8080);
// ========================================
// 2. 設置 CORS
// ========================================
const developmentOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    'https://localhost:3001',
    'https://127.0.0.1:3001',
];
const fallbackOrigins = process.env.NODE_ENV === 'production'
    ? [] // 生產環境必須通過環境變數設定
    : developmentOrigins;
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || fallbackOrigins,
    credentials: true,
};
// ========================================
// 3. 中間件
// ========================================
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use(logger_1.requestBodyLogger);
app.use(logger_1.httpLogger);
// ========================================
// 4. Health Check 端點
// ========================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    });
});
// ========================================
// 5. API 路由
// ========================================
app.use('/api/auth', auth_1.authRouter);
app.use('/api/plaid', plaid_1.plaidRouter);
app.use('/api/assets', asset_1.assetRouter);
app.use('/api/exchange', exchange_1.exchangeRouter);
app.use('/api/notifications', notification_1.notificationRouter);
// ========================================
// 6. 錯誤處理中間件
// ========================================
app.use(logger_1.errorLogger);
app.use((err, req, res, next) => {
    const statusCode = res.statusCode || 500;
    logger_1.appLogger.error('Unhandled error in request', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(statusCode).json({ error: '伺服器錯誤' });
});
// ========================================
// 7. 全局錯誤處理
// ========================================
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕獲的異常:', error);
    logger_1.appLogger.error('Uncaught exception', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未處理的 Promise 拒絕:', reason);
    logger_1.appLogger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});
// ========================================
// 8. 啟動服務器
// ========================================
async function startServer() {
    try {
        // 初始化數據庫連接
        await (0, database_1.initializeDatabase)();
        // 啟動 Express 服務器
        const server = app.listen(PORT, '0.0.0.0', () => {
            (0, logger_1.logStartup)('Kura Backend', '1.0.0', PORT, 'HTTP');
        });
        // 優雅關閉
        process.on('SIGTERM', async () => {
            console.log('💤 Received SIGTERM signal, shutting down...');
            server.close(async () => {
                await (0, database_1.closeDatabase)();
                console.log('✅ Server closed gracefully');
                process.exit(0);
            });
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        await (0, database_1.closeDatabase)();
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map