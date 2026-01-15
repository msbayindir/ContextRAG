import type { LogConfig } from '../types/config.types.js';

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
        if (config.structured) {
            return JSON.stringify({
                timestamp: new Date().toISOString(),
                level,
                message,
                ...meta,
            });
        }
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${metaStr}`;
    };

    const log = (level: keyof typeof LOG_LEVELS, message: string, meta?: LogMeta): void => {
        if (!shouldLog(level)) return;

        if (config.customLogger) {
            config.customLogger(level, message, meta);
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

/**
 * Generate a unique correlation ID for tracking operations
 */
export function generateCorrelationId(): string {
    return `crag_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
