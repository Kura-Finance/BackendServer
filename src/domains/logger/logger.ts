import { createLogger, format, transports } from 'winston';

const { combine, errors, json, printf, splat, timestamp, colorize } = format;

/**
 * Minimal logging configuration.
 *
 * Design goal: stay as close to a no-op as possible. Only errors and warnings
 * are emitted by default; everything below `warn` is silently dropped at the
 * winston level even if some legacy call site forgets to be cleaned up.
 *
 * No file transports, no daily rotation — Cloud Run / Docker captures stdout
 * already and we don't want to bloat the host disk with verbose app logs.
 *
 * The level can still be raised explicitly via `LOG_LEVEL=debug` when
 * troubleshooting locally; in production it stays at `warn` regardless.
 */
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';

const developmentFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaText = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp as string} [${level}]: ${stack || message}${metaText}`;
});

const consoleTransport = new transports.Console({
  format: isProduction
    ? combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json())
    : combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        splat(),
        developmentFormat,
      ),
});

export const appLogger = createLogger({
  level: logLevel,
  defaultMeta: { service: 'kura-backend' },
  transports: [consoleTransport],
  exitOnError: false,
});

// Global safety net: we still want to know about unhandled async failures,
// even though every other operational log has been stripped.
process.on('unhandledRejection', (reason) => {
  appLogger.error('Unhandled Rejection', { reason });
});

process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
