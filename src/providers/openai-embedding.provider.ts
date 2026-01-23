/**
 * OpenAI Embedding Provider
 * 
 * Implementation of EmbeddingProvider for OpenAI's text-embedding-3 models.
 * Supports text-embedding-3-small (1536 dim) and text-embedding-3-large (3072 dim).
 * 
 * Note: OpenAI doesn't have native taskType support, so we use prefix-based
 * optimization for retrieval tasks (similar to E5 models).
 */

import OpenAI from 'openai';
import type {
    EmbeddingProvider,
    EmbeddingResult,
    EmbeddingTaskType,
} from '../types/embedding-provider.types.js';
import { RateLimitError, GeminiAPIError } from '../errors/index.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';

/**
 * Configuration for OpenAIEmbeddingProvider
 */
export interface OpenAIEmbeddingProviderConfig {
    apiKey: string;
    model?: string;
    /** Optional dimension override for text-embedding-3 models */
    dimensions?: number;
}

/**
 * Default dimensions for OpenAI models
 */
const OPENAI_DIMENSIONS: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536, // Legacy
};

/**
 * OpenAI embedding provider implementation
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    readonly id: string;
    readonly dimension: number;
    readonly model: string;

    private readonly client: OpenAI;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;
    private readonly dimensions?: number;

    constructor(
        config: OpenAIEmbeddingProviderConfig,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.model = config.model ?? 'text-embedding-3-small';
        this.id = `openai-${this.model}`;
        this.dimensions = config.dimensions;

        // Determine dimension (use override if provided, otherwise use default for model)
        this.dimension = config.dimensions ?? OPENAI_DIMENSIONS[this.model] ?? 1536;

        this.client = new OpenAI({
            apiKey: config.apiKey,
        });
        this.rateLimiter = rateLimiter;
        this.logger = logger;

        this.logger.debug('OpenAIEmbeddingProvider initialized', {
            model: this.model,
            dimension: this.dimension,
        });
    }

    /**
     * Generate embedding for text with optional task type
     * 
     * Note: OpenAI doesn't support native taskType, so we use prefix-based
     * optimization for retrieval tasks (similar to E5 models).
     */
    async embed(text: string, taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddingResult> {
        await this.rateLimiter.acquire();

        try {
            // Apply task-specific prefix for retrieval optimization
            const processedText = this.applyTaskPrefix(text, taskType);

            const response = await this.client.embeddings.create({
                model: this.model,
                input: processedText,
                ...(this.dimensions && { dimensions: this.dimensions }),
            });

            this.rateLimiter.reportSuccess();

            const embedding = response.data[0]?.embedding;
            if (!embedding) {
                throw new GeminiAPIError('No embedding returned from OpenAI API');
            }

            return {
                embedding,
                tokenCount: response.usage?.total_tokens ?? this.estimateTokenCount(text),
            };
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts: string[], taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddingResult[]> {
        await this.rateLimiter.acquire();

        try {
            // Apply task prefix to all texts
            const processedTexts = texts.map(text => this.applyTaskPrefix(text, taskType));

            const response = await this.client.embeddings.create({
                model: this.model,
                input: processedTexts,
                ...(this.dimensions && { dimensions: this.dimensions }),
            });

            this.rateLimiter.reportSuccess();

            return response.data.map((item, _) => ({
                embedding: item.embedding,
                tokenCount: Math.ceil((response.usage?.total_tokens ?? 0) / texts.length),
            }));
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Embed a document for indexing
     */
    async embedDocument(text: string): Promise<EmbeddingResult> {
        return this.embed(text, 'RETRIEVAL_DOCUMENT');
    }

    /**
     * Embed a search query
     */
    async embedQuery(text: string): Promise<EmbeddingResult> {
        return this.embed(text, 'RETRIEVAL_QUERY');
    }

    /**
     * Apply task-specific prefix for retrieval optimization
     * 
     * This is a common technique used by E5 and similar models to improve
     * retrieval performance by differentiating queries from documents.
     */
    private applyTaskPrefix(text: string, taskType?: EmbeddingTaskType): string {
        switch (taskType) {
            case 'RETRIEVAL_DOCUMENT':
                return `passage: ${text}`;
            case 'RETRIEVAL_QUERY':
                return `query: ${text}`;
            case 'CLASSIFICATION':
                return `classify: ${text}`;
            case 'CLUSTERING':
                return `cluster: ${text}`;
            case 'SEMANTIC_SIMILARITY':
            default:
                return text;
        }
    }

    /**
     * Estimate token count from text (OpenAI uses ~4 chars per token for English)
     */
    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Handle API errors with specific error types
     */
    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('OpenAI Embedding API rate limit exceeded');
        }

        if (message.includes('quota') || message.includes('insufficient_quota')) {
            throw new GeminiAPIError('OpenAI API quota exceeded', {
                statusCode: 429,
                retryable: false,
            });
        }

        if (message.includes('invalid_api_key') || message.includes('authentication')) {
            throw new GeminiAPIError('Invalid OpenAI API key', {
                statusCode: 401,
                retryable: false,
            });
        }

        this.logger.error('OpenAI Embedding API error', {
            error: error.message,
        });
    }
}
