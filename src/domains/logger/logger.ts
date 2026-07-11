import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const { combine, errors, json, printf, splat, timestamp, colorize } = format;

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// 创建日志目录（仅在非生产环境）
let logsDir: string | null = null;
if (!isProduction) {
  logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch (error) {
      console.warn('⚠️ Unable to create logs directory. Logs will be written to stdout.');
      logsDir = null;
    }
  }
}

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

// 构建 transports 数组（生产环境仅使用 console，开发环境使用 console + 文件）
const transportsList: any[] = [consoleTransport];

// 仅在非生产环境且能成功创建日志目录时，才添加文件 transport
if (!isProduction && logsDir) {
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

  transportsList.push(allLogsTransport, errorLogsTransport);
}

// 创建 Logger
const exceptionHandlers: any[] = [];
const rejectionHandlers: any[] = [];

// 仅在非生产环境且能成功创建日志目录时，才添加文件异常处理器
if (!isProduction && logsDir) {
  exceptionHandlers.push(
    new transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
      ),
    })
  );

  rejectionHandlers.push(
    new transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
      ),
    })
  );
}

export const appLogger = createLogger({
  level: logLevel,
  defaultMeta: { service: 'kura-backend' },
  transports: transportsList,
  exceptionHandlers: exceptionHandlers.length > 0 ? exceptionHandlers : undefined,
  rejectionHandlers: rejectionHandlers.length > 0 ? rejectionHandlers : undefined,
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
