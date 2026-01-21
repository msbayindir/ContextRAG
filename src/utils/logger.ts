import type { LogConfig } from '../types/config.types.js';
import { getCorrelationId } from '../errors/index.js';

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

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
} as const;

/**
 * Creates a logger instance based on configuration
 * Automatically injects correlation ID into all log entries
 */
export function createLogger(config: LogConfig): Logger {
    const currentLevel = LOG_LEVELS[config.level];

    const shouldLog = (level: keyof typeof LOG_LEVELS): boolean => {
        return LOG_LEVELS[level] >= currentLevel;
    };

    const formatMessage = (
        level: string,
        message: string,
        meta?: LogMeta
    ): string => {
        // Auto-inject correlation ID if not provided
        const enrichedMeta = {
            correlationId: meta?.correlationId ?? getCorrelationId(),
            ...meta,
        };

        if (config.structured) {
            return JSON.stringify({
                timestamp: new Date().toISOString(),
                level,
                message,
                ...enrichedMeta,
            });
        }
        const metaStr = enrichedMeta ? ` ${JSON.stringify(enrichedMeta)}` : '';
        return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${metaStr}`;
    };

    const log = (level: keyof typeof LOG_LEVELS, message: string, meta?: LogMeta): void => {
        if (!shouldLog(level)) return;

        if (config.customLogger) {
            // Inject correlation ID for custom loggers too
            const enrichedMeta = {
                correlationId: meta?.correlationId ?? getCorrelationId(),
                ...meta,
            };
            config.customLogger(level, message, enrichedMeta);
            return;
        }

        const formattedMessage = formatMessage(level, message, meta);

        switch (level) {
            case 'debug':
            case 'info':
                // eslint-disable-next-line no-console
                console.log(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            case 'error':
                console.error(formattedMessage);
                break;
        }
    };

    return {
        debug: (message: string, meta?: LogMeta) => log('debug', message, meta),
        info: (message: string, meta?: LogMeta) => log('info', message, meta),
        warn: (message: string, meta?: LogMeta) => log('warn', message, meta),
        error: (message: string, meta?: LogMeta) => log('error', message, meta),
    };
}
