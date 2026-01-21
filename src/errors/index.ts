/**
 * Error context for correlation and tracing
 */
export interface ErrorContext {
    /** Unique correlation ID for request tracing */
    correlationId?: string;
    /** Timestamp when error occurred */
    timestamp?: Date;
    /** Original cause of the error */
    cause?: Error;
    /** Operation that was being performed */
    operation?: string;
}

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
    return `crag_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get current correlation ID from async context or generate new one
 */
let currentCorrelationId: string | undefined;

export function setCorrelationId(id: string): void {
    currentCorrelationId = id;
}

export function getCorrelationId(): string {
    return currentCorrelationId ?? generateCorrelationId();
}

export function clearCorrelationId(): void {
    currentCorrelationId = undefined;
}

/**
 * Base error class for Context-RAG
 * All errors extend this class for consistent handling
 */
export class ContextRAGError extends Error {
    public readonly code: string;
    public readonly details?: Record<string, unknown>;
    public readonly correlationId: string;
    public readonly timestamp: Date;
    public readonly cause?: Error;
    public readonly operation?: string;

    constructor(
        message: string,
        code: string,
        details?: Record<string, unknown>,
        context?: ErrorContext
    ) {
        super(message);
        this.name = 'ContextRAGError';
        this.code = code;
        this.details = details;
        this.correlationId = context?.correlationId ?? getCorrelationId();
        this.timestamp = context?.timestamp ?? new Date();
        this.cause = context?.cause;
        this.operation = context?.operation;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            details: this.details,
            correlationId: this.correlationId,
            timestamp: this.timestamp.toISOString(),
            operation: this.operation,
            cause: this.cause ? {
                name: this.cause.name,
                message: this.cause.message,
            } : undefined,
        };
    }
}

/**
 * Wrap an unknown error into a ContextRAGError
 */
export function wrapError(
    error: unknown,
    ErrorClass: new (message: string, details?: Record<string, unknown>) => ContextRAGError,
    operation?: string
): ContextRAGError {
    if (error instanceof ContextRAGError) {
        return error;
    }

    const originalError = error instanceof Error ? error : new Error(String(error));
    const wrapped = new ErrorClass(originalError.message, {
        originalError: originalError.name,
        stack: originalError.stack,
    });

    // Copy over correlation context
    Object.defineProperty(wrapped, 'cause', { value: originalError });
    Object.defineProperty(wrapped, 'operation', { value: operation });

    return wrapped;
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

/**
 * Gemini API specific errors
 */
export class GeminiAPIError extends ContextRAGError {
    public readonly statusCode?: number;
    public readonly retryable: boolean;

    constructor(
        message: string,
        options: {
            statusCode?: number;
            retryable?: boolean;
            details?: Record<string, unknown>;
        } = {}
    ) {
        super(message, 'GEMINI_API_ERROR', options.details);
        this.name = 'GeminiAPIError';
        this.statusCode = options.statusCode;
        this.retryable = options.retryable ?? false;
    }
}

/**
 * PDF processing errors
 */
export class PDFProcessingError extends ContextRAGError {
    public readonly filename?: string;

    constructor(message: string, filename?: string, details?: Record<string, unknown>) {
        super(message, 'PDF_PROCESSING_ERROR', { filename, ...details });
        this.name = 'PDFProcessingError';
        this.filename = filename;
    }
}

/**
 * Content policy violation errors (non-retryable)
 */
export class ContentPolicyError extends ContextRAGError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONTENT_POLICY_ERROR', details);
        this.name = 'ContentPolicyError';
    }
}

/**
 * Reranking-related errors
 */
export class RerankingError extends ContextRAGError {
    public readonly provider: 'gemini' | 'cohere' | 'none';
    public readonly retryable: boolean;

    constructor(
        message: string,
        provider: 'gemini' | 'cohere' | 'none',
        options: {
            retryable?: boolean;
            details?: Record<string, unknown>;
        } = {}
    ) {
        super(message, 'RERANKING_ERROR', { provider, ...options.details });
        this.name = 'RerankingError';
        this.provider = provider;
        this.retryable = options.retryable ?? true;
    }
}

/**
 * Processing warning (non-fatal issue during processing)
 */
export interface ProcessingWarning {
    /** Warning type */
    type: 'FALLBACK_USED' | 'LOW_CONFIDENCE' | 'PARSE_ERROR' | 'RERANKING_FAILED' | 'CONTEXT_SKIPPED';
    /** Related batch index if applicable */
    batch?: number;
    /** Warning message */
    message: string;
    /** Additional details */
    details?: Record<string, unknown>;
}

