import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initializeEnv } from './config/env';
import { prisma, initializeDatabase, closeDatabase } from './domains/shared/lib/database';
import { authRouter } from './domains/auth';
import { plaidRouter } from './domains/plaid';
import { assetRouter } from './domains/asset';
import { exchangeRouter } from './domains/exchange';
import { notificationRouter } from './domains/notification';
import {
  appLogger,
  httpLogger,
  requestBodyLogger,
  errorLogger,
  logStartup,
} from './domains/logger';

// ========================================
// 1. 初始化環境變數和數據庫 URL
// ========================================
initializeEnv();

const app = express();
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
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestBodyLogger);
app.use(httpLogger);

// ========================================
// 4. Health Check 端點
// ========================================
app.get('/health', (req: Request, res: Response) => {
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
app.use('/api/auth', authRouter);
app.use('/api/plaid', plaidRouter);
app.use('/api/assets', assetRouter);
app.use('/api/exchange', exchangeRouter);
app.use('/api/notifications', notificationRouter);

// ========================================
// 6. 錯誤處理中間件
// ========================================
app.use(errorLogger);
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode || 500;
  appLogger.error('Unhandled error in request', {
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
  appLogger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
  appLogger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// ========================================
// 8. 啟動服務器
// ========================================
async function startServer() {
  try {
    // 初始化數據庫連接
    await initializeDatabase();

    // 啟動 Express 服務器
    const server = app.listen(PORT, '0.0.0.0', () => {
      logStartup('Kura Backend', '1.0.0', PORT, 'HTTP');
    });

    // 優雅關閉
    process.on('SIGTERM', async () => {
      console.log('💤 Received SIGTERM signal, shutting down...');
      server.close(async () => {
        await closeDatabase();
        console.log('✅ Server closed gracefully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await closeDatabase();
    process.exit(1);
  }
}

startServer();