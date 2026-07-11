import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initializeEnv } from './config/env';
import { prisma, initializeDatabase, closeDatabase } from './domains/shared/lib/database';
import { authRouter } from './domains/auth';
import { plaidRouter } from './domains/plaid';
import { assetRouter } from './domains/asset';
import { exchangeRouter } from './domains/exchange';
import { notificationRouter } from './domains/notification';
import { debankRouter } from './domains/debank';
import { stripeRouter } from './domains/stripe';
import {
  appLogger,
  httpLogger,
  requestBodyLogger,
  errorLogger,
  logStartup,
  logDebug,
} from './domains/logger';
import { rateLimiter, authRateLimiter } from './domains/shared/middleware/rateLimiter';

// ========================================
// 1. 初始化環境變數和數據庫 URL
// ========================================
initializeEnv();

const app = express();
const PORT = Number(process.env.PORT || 8080);

// ========================================
// 1.5 信任代理設置 (用於獲取真實客戶端 IP)
// ========================================
app.set('trust proxy', 1); // 信任第一層代理 (適用於 Cloud Run、Nginx 等)

// Stripe webhook 必須使用原始請求內容做簽章驗證
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Number'],
  maxAge: 86400, // 24 小時的預檢快取
};

// ========================================
// 3. 中間件
// ========================================
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(requestBodyLogger);
app.use(httpLogger);

// Cookie 調試中間件（開發環境）
if (process.env.DEBUG_COOKIES === 'true') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const authCookie = req.cookies.authToken;
    logDebug('Cookie Debug Info', {
      path: req.path,
      hasAuthCookie: !!authCookie,
      cookieCount: Object.keys(req.cookies || {}).length,
      allCookies: Object.keys(req.cookies || {}),
      userAgent: req.get('User-Agent'),
    });
    next();
  });
}

// 為認證路由應用寬鬆的速率限制
app.use('/api/auth', authRateLimiter);

// 為其他 API 應用一般的速率限制
app.use('/api/', rateLimiter); // 速率限制中間件 - 防止 API 被攻擊

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
app.use('/api/debank', debankRouter);
app.use('/api/stripe', stripeRouter);

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
  res.status(statusCode).json({ error: 'Internal server error' });
});

// ========================================
// 7. 全局錯誤處理
// ========================================
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  appLogger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled promise rejection:', reason);
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