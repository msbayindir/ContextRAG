import type { LogConfig } from '../types/config.types.js';
import { getCorrelationId } from '../errors/index.js';
import pino from 'pino';

export interface LogMeta {
    correlationId?: string;
    documentId?: string;
    batchId?: string;
    [key: string]: unknown;
}

export interface Logger {
    debug(message: string, meta?: LogMeta): void;
    info(message: string, meta?: LogMeta): void;
    warn(message: string, meta?: LogMeta): void;
    error(message: string, meta?: LogMeta): void;
}

/**
 * Pino log level mapping
 */
const PINO_LEVELS: Record<string, string> = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
};

/**
 * Creates a high-performance Pino logger instance
 * Automatically injects correlation ID into all log entries
 * 
 * Features:
 * - Async, non-blocking writes (5-10x faster than console.log)
 * - Structured JSON logging for production
 * - Pretty print for development
 * - Automatic correlation ID injection
 */
export function createLogger(config: LogConfig): Logger {
    // Use pino-pretty for development (non-structured), raw JSON for production
    const pinoLogger = pino({
        level: config.level,
        // Use transport for pretty printing in dev mode
        ...(config.structured === false && {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        }),
    });

    /**
     * Enrich metadata with correlation ID
     */
    const enrichMeta = (meta?: LogMeta): LogMeta => ({
        correlationId: meta?.correlationId ?? getCorrelationId(),
        ...meta,
    });

    /**
     * Log with optional custom logger fallback
     */
    const log = (level: keyof typeof PINO_LEVELS, message: string, meta?: LogMeta): void => {
        const enrichedMeta = enrichMeta(meta);

        // Support custom logger if configured
        if (config.customLogger) {
            config.customLogger(level, message, enrichedMeta);
            return;
        }

        // Use Pino's native logging
        pinoLogger[level as 'debug' | 'info' | 'warn' | 'error'](enrichedMeta, message);
    };

    return {
        debug: (message: string, meta?: LogMeta) => log('debug', message, meta),
        info: (message: string, meta?: LogMeta) => log('info', message, meta),
        warn: (message: string, meta?: LogMeta) => log('warn', message, meta),
        error: (message: string, meta?: LogMeta) => log('error', message, meta),
    };
}

