/**
 * Embedding Provider Types
 * 
 * Modular interface for embedding providers (Gemini, OpenAI, Cohere, etc.)
 * Enables swapping embedding models without changing application code.
 */

/**
 * Task type for embedding generation
 * Different task types optimize the embedding for specific use cases
 */
export type EmbeddingTaskType =
    | 'RETRIEVAL_DOCUMENT'  // For documents to be indexed
    | 'RETRIEVAL_QUERY'     // For search queries
    | 'SEMANTIC_SIMILARITY' // For similarity comparison
    | 'CLASSIFICATION'      // For classification tasks
    | 'CLUSTERING';         // For clustering tasks

/**
 * Result from embedding generation
 */
export interface EmbeddingResult {
    /** The embedding vector */
    embedding: number[];
    /** Approximate token count of input text */
    tokenCount: number;
}

/**
 * Core embedding provider interface
 * All embedding providers must implement this interface
 */
export interface EmbeddingProvider {
    /** Unique identifier for this provider instance */
    readonly id: string;

    /** Vector dimension produced by this provider */
    readonly dimension: number;

    /** Model name being used */
    readonly model: string;

    /**
     * Generate embedding for a single text
     * @param text - Text to embed
     * @param taskType - Purpose of embedding (affects optimization)
     */
    embed(text: string, taskType?: EmbeddingTaskType): Promise<EmbeddingResult>;

    /**
     * Generate embeddings for multiple texts
     * @param texts - Array of texts to embed
     * @param taskType - Purpose of embeddings
     */
    embedBatch(texts: string[], taskType?: EmbeddingTaskType): Promise<EmbeddingResult[]>;

    /**
     * Embed a document for indexing
     * Uses RETRIEVAL_DOCUMENT task type
     */
    embedDocument(text: string): Promise<EmbeddingResult>;

    /**
     * Embed a search query
     * Uses RETRIEVAL_QUERY task type
     */
    embedQuery(text: string): Promise<EmbeddingResult>;
}

/**
 * Supported embedding providers
 */
export type EmbeddingProviderType = 'gemini' | 'openai' | 'cohere';

/**
 * Base configuration for embedding providers
 */
export interface BaseEmbeddingProviderConfig {
    /** Provider type */
    provider: EmbeddingProviderType;
    /** API key (if not specified, uses main API key from config) */
    apiKey?: string;
    /** Model to use for embeddings */
    model?: string;
}

/**
 * Gemini-specific embedding configuration
 */
export interface GeminiEmbeddingConfig extends BaseEmbeddingProviderConfig {
    provider: 'gemini';
    /** Model name (default: 'text-embedding-004') */
    model?: string;
}

/**
 * OpenAI-specific embedding configuration (for Phase 3)
 */
export interface OpenAIEmbeddingConfig extends BaseEmbeddingProviderConfig {
    provider: 'openai';
    /** Model name (e.g., 'text-embedding-3-large') */
    model?: string;
    /** Dimensions to return (optional, for dimension reduction) */
    dimensions?: number;
}

/**
 * Cohere-specific embedding configuration (for Phase 3)
 */
export interface CohereEmbeddingConfig extends BaseEmbeddingProviderConfig {
    provider: 'cohere';
    /** Model name (e.g., 'embed-multilingual-v3.0') */
    model?: string;
    /** Input type for optimization */
    inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
}

/**
 * Union type for all embedding provider configs
 */
export type EmbeddingProviderConfig =
    | GeminiEmbeddingConfig
    | OpenAIEmbeddingConfig
    | CohereEmbeddingConfig;

/**
 * Default dimensions for each provider
 */
export const EMBEDDING_DIMENSIONS: Record<EmbeddingProviderType, number> = {
    gemini: 768,    // text-embedding-004
    openai: 1536,   // text-embedding-3-small (or 3072 for large)
    cohere: 1024,   // embed-multilingual-v3.0
};

/**
 * Default models for each provider
 */
export const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProviderType, string> = {
    gemini: 'text-embedding-004',
    openai: 'text-embedding-3-small',
    cohere: 'embed-multilingual-v3.0',
};
