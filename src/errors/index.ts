/**
 * Base error class for Context-RAG
 */
export class ContextRAGError extends Error {
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    constructor(message: string, code: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'ContextRAGError';
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends ContextRAGError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONFIGURATION_ERROR', details);
        this.name = 'ConfigurationError';
    }
}

/**
 * Ingestion-related errors
 */
export class IngestionError extends ContextRAGError {
    public readonly batchIndex?: number;
    public readonly retryable: boolean;

    constructor(
        message: string,
        options: {
            batchIndex?: number;
            retryable?: boolean;
            details?: Record<string, unknown>;
        } = {}
    ) {
        super(message, 'INGESTION_ERROR', options.details);
        this.name = 'IngestionError';
        this.batchIndex = options.batchIndex;
        this.retryable = options.retryable ?? false;
    }
}

/**
 * Search-related errors
 */
export class SearchError extends ContextRAGError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'SEARCH_ERROR', details);
        this.name = 'SearchError';
    }
}

/**
 * Discovery-related errors
 */
export class DiscoveryError extends ContextRAGError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'DISCOVERY_ERROR', details);
        this.name = 'DiscoveryError';
    }
}

/**
 * Database-related errors
 */
export class DatabaseError extends ContextRAGError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'DATABASE_ERROR', details);
        this.name = 'DatabaseError';
    }
}

/**
 * Rate limit errors (retryable)
 */
export class RateLimitError extends ContextRAGError {
    public readonly retryAfterMs?: number;

    constructor(message: string, retryAfterMs?: number) {
        super(message, 'RATE_LIMIT_ERROR', { retryAfterMs });
        this.name = 'RateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Validation errors
 */
export class ValidationError extends ContextRAGError {
    public readonly field?: string;

    constructor(message: string, field?: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', { field, ...details });
        this.name = 'ValidationError';
        this.field = field;
    }
}

/**
 * Not found errors
 */
export class NotFoundError extends ContextRAGError {
    public readonly resourceType: string;
    public readonly resourceId: string;

    constructor(resourceType: string, resourceId: string) {
        super(`${resourceType} not found: ${resourceId}`, 'NOT_FOUND', {
            resourceType,
            resourceId,
        });
        this.name = 'NotFoundError';
        this.resourceType = resourceType;
        this.resourceId = resourceId;
    }
}
