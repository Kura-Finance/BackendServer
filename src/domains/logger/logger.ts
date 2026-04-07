import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const { combine, errors, json, printf, splat, timestamp, colorize } = format;

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// 自定义日志格式
const developmentFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaText = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp as string} [${level}]: ${stack || message}${metaText}`;
});

const productionFormat = printf(({ timestamp, level, message, stack, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    stack: stack || undefined,
    ...meta,
  });
});

// 控制台传输配置
const consoleTransport = new transports.Console({
  format: isProduction
    ? combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json())
    : combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        splat(),
        developmentFormat
      ),
});

// 全量日志文件（所有级别）
const allLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
});

// 错误日志文件
const errorLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    productionFormat
  ),
});

// 警告日志文件
const warnLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'warn-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'warn',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
});

// 创建 Logger
export const appLogger = createLogger({
  level: logLevel,
  defaultMeta: { service: 'kura-backend' },
  transports: isProduction
    ? [
        consoleTransport,
        allLogsTransport,
        errorLogsTransport,
        warnLogsTransport,
      ]
    : [consoleTransport],
  exceptionHandlers: [
    new transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
      ),
    }),
  ],
  rejectionHandlers: [
    new transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
      ),
    }),
  ],
  exitOnError: false,
});

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  appLogger.error('Unhandled Rejection', {
    reason,
    promise,
  });
});

process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
