import { z } from 'zod';
import type { RagEnhancementConfig } from './rag-enhancement.types.js';

/**
 * Minimal interface for Prisma client operations used by Context-RAG.
 * This allows using any Prisma client instance that provides the required models.
 * 
 * Users should pass their generated PrismaClient instance which will
 * satisfy this interface if the Context-RAG models are properly defined.
 */
export interface PrismaClientLike {
    /** ContextRagPromptConfig model operations */
    contextRagPromptConfig: any;
    /** ContextRagChunk model operations */
    contextRagChunk: any;
    /** ContextRagDocument model operations */
    contextRagDocument: any;
    /** ContextRagBatch model operations */
    contextRagBatch: any;
    /** Execute raw SQL query */
    $executeRaw: (query: any, ...values: any[]) => Promise<number>;
    /** Execute raw SQL query and return results */
    $queryRaw: <T = any>(query: any, ...values: any[]) => Promise<T>;
    /** Execute raw SQL query (unsafe - for dynamic queries) */
    $executeRawUnsafe: (query: string, ...values: any[]) => Promise<number>;
    /** Query raw SQL (unsafe - for dynamic queries) */
    $queryRawUnsafe: <T = any>(query: string, ...values: any[]) => Promise<T>;
    /** Transaction support */
    $transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
}

// Legacy interface kept for backward compatibility but currently unused in strict checks
export interface PrismaModelOperations {
    create(args: any): Promise<any>;
    createMany(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    findFirst(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<any>;
    delete(args: any): Promise<any>;
    deleteMany(args: any): Promise<any>;
    count(args?: any): Promise<number>;
    aggregate(args: any): Promise<any>;
}

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
 * Reranking configuration
 */
export interface RerankingConfig {
    /** Enable reranking by default (default: false) */
    enabled: boolean;
    /** Reranker provider: 'gemini' | 'cohere' */
    provider: 'gemini' | 'cohere';
    /** Cohere API key (required if provider is 'cohere') */
    cohereApiKey?: string;
    /** Default number of candidates to retrieve before reranking */
    defaultCandidates: number;
    /** Default top K to return after reranking */
    defaultTopK: number;
}

/**
 * Embedding provider configuration
 * Enables switching between different embedding providers (ISP compliance)
 */
export interface EmbeddingConfig {
    /** Provider type: 'gemini' | 'openai' | 'cohere' */
    provider: 'gemini' | 'openai' | 'cohere';
    /** API key for the provider (falls back to main API key if not specified) */
    apiKey?: string;
    /** Model name for embeddings */
    model?: string;
}

/**
 * LLM provider configuration
 * Enables switching between different LLM providers
 */
export interface LLMProviderConfig {
    /** Provider type: 'gemini' | 'openai' | 'anthropic' */
    provider: 'gemini' | 'openai' | 'anthropic';
    /** API key for the provider (falls back to env or geminiApiKey) */
    apiKey?: string;
    /** Model name for generation */
    model?: string;
}

/**
 * Chunk type mapping for custom extraction types
 * Maps custom types (from user prompts) to system types
 * Example: { 'RECIPE': 'TEXT', 'INGREDIENT': 'LIST' }
 */
export type ChunkTypeMapping = Record<string, 'TEXT' | 'TABLE' | 'LIST' | 'HEADING' | 'CODE' | 'QUOTE' | 'IMAGE_REF' | 'QUESTION' | 'MIXED'>;

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
    | 'gemini-2.5-flash'
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
    /** Enable structured output (JSON schema) for better reliability (default: true) */
    useStructuredOutput?: boolean;
    /** Reranking configuration */
    rerankingConfig?: Partial<RerankingConfig>;
    /**
     * Custom chunk type mapping
     * Maps custom types (e.g., 'RECIPE') to system types (e.g., 'TEXT')
     * Original type is preserved in chunk metadata.originalType
     * @example { 'RECIPE': 'TEXT', 'INGREDIENT': 'LIST', 'NUTRITION': 'TABLE' }
     */
    chunkTypeMapping?: ChunkTypeMapping;

    /**
     * Embedding provider configuration (default: Gemini)
     * Allows switching between different embedding providers
     * @example { provider: 'openai', model: 'text-embedding-3-large' }
     */
    embeddingProvider?: EmbeddingConfig;

    /**
     * LLM provider configuration (default: Gemini)
     * Allows switching between different LLM providers for text generation
     */
    llmProvider?: LLMProviderConfig;

    /**
     * Document LLM provider configuration (default: llmProvider)
     * Allows using a dedicated provider for PDF/document processing
     */
    documentProvider?: LLMProviderConfig;
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
    useStructuredOutput: boolean;
    rerankingConfig: RerankingConfig;
    /** Custom chunk type mapping (optional) */
    chunkTypeMapping?: ChunkTypeMapping;
    /** LLM provider configuration */
    llmProvider: LLMProviderConfig;
    /** Document LLM provider configuration */
    documentProvider: LLMProviderConfig;
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

export const DEFAULT_RERANKING_CONFIG: RerankingConfig = {
    enabled: false,
    provider: 'gemini',
    defaultCandidates: 50,
    defaultTopK: 10,
};

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
    provider: 'gemini',
    model: 'text-embedding-004',
};
/**
 * Default LLM provider configuration
 */
export const DEFAULT_LLM_PROVIDER: LLMProviderConfig = {
    provider: 'gemini',
};

/**
 * Zod schema for config validation
 */
export const configSchema = z.object({
    geminiApiKey: z.string().min(1, 'Gemini API key is required'),
    llmProvider: z.object({
        provider: z.enum(['gemini', 'openai', 'anthropic']),
        apiKey: z.string().optional(),
        model: z.string().optional(),
    }).optional(),
    documentProvider: z.object({
        provider: z.enum(['gemini', 'openai', 'anthropic']),
        apiKey: z.string().optional(),
        model: z.string().optional(),
    }).optional(),
    model: z.enum([
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-pro',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
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
