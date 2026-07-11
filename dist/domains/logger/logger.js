"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appLogger = void 0;
const winston_1 = require("winston");
const winston_daily_rotate_file_1 = __importDefault(require("winston-daily-rotate-file"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const { combine, errors, json, printf, splat, timestamp, colorize } = winston_1.format;
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
// 创建日志目录（仅在非生产环境）
let logsDir = null;
if (!isProduction) {
    logsDir = path_1.default.join(process.cwd(), 'logs');
    if (!fs_1.default.existsSync(logsDir)) {
        try {
            fs_1.default.mkdirSync(logsDir, { recursive: true });
        }
        catch (error) {
            console.warn('⚠️ 无法创建 logs 目录，日志将输出到 stdout');
            logsDir = null;
        }
    }
}
// 自定义日志格式
const developmentFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaText = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaText}`;
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
const consoleTransport = new winston_1.transports.Console({
    format: isProduction
        ? combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json())
        : combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), splat(), developmentFormat),
});
// 构建 transports 数组（生产环境仅使用 console，开发环境使用 console + 文件）
const transportsList = [consoleTransport];
// 仅在非生产环境且能成功创建日志目录时，才添加文件 transport
if (!isProduction && logsDir) {
    // 全量日志文件（所有级别）
    const allLogsTransport = new winston_daily_rotate_file_1.default({
        filename: path_1.default.join(logsDir, 'app-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json()),
    });
    // 错误日志文件
    const errorLogsTransport = new winston_daily_rotate_file_1.default({
        filename: path_1.default.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        level: 'error',
        format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), productionFormat),
    });
    transportsList.push(allLogsTransport, errorLogsTransport);
}
// 创建 Logger
const exceptionHandlers = [];
const rejectionHandlers = [];
// 仅在非生产环境且能成功创建日志目录时，才添加文件异常处理器
if (!isProduction && logsDir) {
    exceptionHandlers.push(new winston_1.transports.File({
        filename: path_1.default.join(logsDir, 'exceptions.log'),
        format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json()),
    }));
    rejectionHandlers.push(new winston_1.transports.File({
        filename: path_1.default.join(logsDir, 'rejections.log'),
        format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json()),
    }));
}
exports.appLogger = (0, winston_1.createLogger)({
    level: logLevel,
    defaultMeta: { service: 'kura-backend' },
    transports: transportsList,
    exceptionHandlers: exceptionHandlers.length > 0 ? exceptionHandlers : undefined,
    rejectionHandlers: rejectionHandlers.length > 0 ? rejectionHandlers : undefined,
    exitOnError: false,
});
// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
    exports.appLogger.error('Unhandled Rejection', {
        reason,
        promise,
    });
});
process.on('uncaughtException', (error) => {
    exports.appLogger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});
//# sourceMappingURL=logger.js.map