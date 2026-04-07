import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { authRouter } from './domains/auth';
import { plaidRouter } from './domains/plaid';
import {
  appLogger,
  httpLogger,
  requestBodyLogger,
  errorLogger,
  logStartup,
} from './domains/logger';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envResult = dotenv.config({ path: envFile });
if (envResult.error) {
  dotenv.config();
}

const app = express();
const defaultFrontendOrigin =
  process.env.NODE_ENV === 'production' ? 'http://localhost:3000' : 'https://localhost:3000';
const fallbackOrigins = Array.from(
  new Set([
    defaultFrontendOrigin,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    'https://localhost:3001',
    'https://127.0.0.1:3001',
  ])
);

// Middleware
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || fallbackOrigins,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestBodyLogger);
app.use(httpLogger);

// Domain Router Registration
app.use('/api/auth', authRouter);
app.use('/api/plaid', plaidRouter);

// 錯誤處理中間件
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

// 啟動 Server
const PORT = Number(process.env.PORT || 8080);
const defaultCertPath = path.resolve(process.cwd(), '../certificates/localhost.pem');
const defaultKeyPath = path.resolve(process.cwd(), '../certificates/localhost-key.pem');
const certPath = process.env.SSL_CERT_PATH
  ? path.resolve(process.cwd(), process.env.SSL_CERT_PATH)
  : defaultCertPath;
const keyPath = process.env.SSL_KEY_PATH
  ? path.resolve(process.cwd(), process.env.SSL_KEY_PATH)
  : defaultKeyPath;
const shouldUseHttps = (process.env.BACKEND_USE_HTTPS || '').toLowerCase() === 'true';

if (shouldUseHttps) {
  try {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);

    https.createServer({ key, cert }, app).listen(PORT, () => {
      logStartup('Kura Backend', '1.0.0', PORT);
    });
  } catch (error) {
    appLogger.warn('HTTPS cert/key not found, falling back to HTTP', {
      certPath,
      keyPath,
      error: error instanceof Error ? error.message : error,
    });

    app.listen(PORT, () => {
      logStartup('Kura Backend', '1.0.0', PORT);
    });
  }
} else {
  app.listen(PORT, () => {
    logStartup('Kura Backend', '1.0.0', PORT);
  });
}