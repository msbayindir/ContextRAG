import { z } from 'zod';
import type { RagEnhancementConfig } from './rag-enhancement.types.js';

/**
 * Generic Prisma client type - allows any Prisma client instance
 * This avoids requiring the user to generate Prisma client before using the library
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaClientLike = any;

/**
 * Batch processing configuration
 */
export interface BatchConfig {
    /** Number of pages per batch (default: 15) */
    pagesPerBatch: number;
    /** Maximum concurrent batch processing (default: 3) */
    maxConcurrency: number;
    /** Maximum retry attempts for failed batches (default: 3) */
    maxRetries: number;
    /** Initial retry delay in milliseconds (default: 1000) */
    retryDelayMs: number;
    /** Backoff multiplier for exponential retry (default: 2) */
    backoffMultiplier: number;
}

/**
 * Chunk configuration
 */
export interface ChunkConfig {
    /** Maximum tokens per chunk (default: 500) */
    maxTokens: number;
    /** Overlap tokens between chunks (default: 50) */
    overlapTokens: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    /** Requests per minute limit (default: 60) */
    requestsPerMinute: number;
    /** Enable adaptive rate limiting (default: true) */
    adaptive: boolean;
}

/**
 * Logging configuration
 */
export interface LogConfig {
    /** Log level */
    level: 'debug' | 'info' | 'warn' | 'error';
    /** Enable structured JSON logging (default: true) */
    structured: boolean;
    /** Custom logger function */
    customLogger?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Generation configuration for Gemini API
 */
export interface GenerationConfig {
    /** Temperature for generation (0-2, default: 0.3) */
    temperature: number;
    /** Maximum output tokens (default: 8192) */
    maxOutputTokens: number;
}

/**
 * Main Context-RAG configuration
 */
export interface ContextRAGConfig {
    /** Prisma client instance */
    prisma: PrismaClientLike;
    /** Gemini API key */
    geminiApiKey: string;
    /** Gemini model to use (default: 'gemini-1.5-pro') */
    model?:
    | 'gemini-1.5-pro'
    | 'gemini-1.5-flash'
    | 'gemini-2.0-flash-exp'
    | 'gemini-pro'
    | 'gemini-2.5-pro'
    | 'gemini-3-pro-preview'
    | 'gemini-3-flash-preview';
    /** Embedding model (default: 'text-embedding-004') */
    embeddingModel?: string;
    /** Generation configuration (temperature, maxOutputTokens) */
    generationConfig?: Partial<GenerationConfig>;
    /** Batch processing configuration */
    batchConfig?: Partial<BatchConfig>;
    /** Chunk configuration */
    chunkConfig?: Partial<ChunkConfig>;
    /** Rate limiting configuration */
    rateLimitConfig?: Partial<RateLimitConfig>;
    /** Logging configuration */
    logging?: Partial<LogConfig>;
    /** RAG Enhancement configuration (Contextual Retrieval, etc.) */
    ragEnhancement?: RagEnhancementConfig;
}

/**
 * Internal resolved configuration with all defaults applied
 */
export interface ResolvedConfig {
    prisma: PrismaClientLike;
    geminiApiKey: string;
    model: string;
    embeddingModel: string;
    generationConfig: GenerationConfig;
    batchConfig: BatchConfig;
    chunkConfig: ChunkConfig;
    rateLimitConfig: RateLimitConfig;
    logging: LogConfig;
    ragEnhancement?: RagEnhancementConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
    pagesPerBatch: 15,
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
};

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
    maxTokens: 500,
    overlapTokens: 50,
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
    requestsPerMinute: 60,
    adaptive: true,
};

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
    temperature: 0.3,
    maxOutputTokens: 8192,
};

export const DEFAULT_LOG_CONFIG: LogConfig = {
    level: 'info',
    structured: true,
};

/**
 * Zod schema for config validation
 */
export const configSchema = z.object({
    geminiApiKey: z.string().min(1, 'Gemini API key is required'),
    model: z.enum([
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-pro',
        'gemini-2.5-pro',
        'gemini-3-pro-preview',
        'gemini-3-flash-preview'
    ]).optional(),
    embeddingModel: z.string().optional(),
    batchConfig: z
        .object({
            pagesPerBatch: z.number().min(1).max(50).optional(),
            maxConcurrency: z.number().min(1).max(10).optional(),
            maxRetries: z.number().min(0).max(10).optional(),
            retryDelayMs: z.number().min(100).max(60000).optional(),
            backoffMultiplier: z.number().min(1).max(5).optional(),
        })
        .optional(),
    chunkConfig: z
        .object({
            maxTokens: z.number().min(100).max(2000).optional(),
            overlapTokens: z.number().min(0).max(500).optional(),
        })
        .optional(),
    rateLimitConfig: z
        .object({
            requestsPerMinute: z.number().min(1).max(1000).optional(),
            adaptive: z.boolean().optional(),
        })
        .optional(),
    logging: z
        .object({
            level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
            structured: z.boolean().optional(),
        })
        .optional(),
});

export type ContextRAGOptions = Omit<ContextRAGConfig, 'prisma'>;
