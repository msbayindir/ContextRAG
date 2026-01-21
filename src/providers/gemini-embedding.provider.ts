/**
 * Gemini Embedding Provider
 * 
 * Implementation of EmbeddingProvider for Google's Gemini API.
 * Extracted from GeminiService for modular architecture.
 */

import { GoogleGenerativeAI, type GenerativeModel, TaskType } from '@google/generative-ai';
import type {
    EmbeddingProvider,
    EmbeddingResult,
    EmbeddingTaskType,
} from '../types/embedding-provider.types.js';
import { RateLimitError, GeminiAPIError } from '../errors/index.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';

/**
 * Configuration for GeminiEmbeddingProvider
 */
export interface GeminiEmbeddingProviderConfig {
    apiKey: string;
    model?: string;
}

/**
 * Gemini embedding provider implementation
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
    readonly id: string;
    readonly dimension: number = 768;
    readonly model: string;

    private readonly genAI: GoogleGenerativeAI;
    private readonly embeddingModel: GenerativeModel;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(
        config: GeminiEmbeddingProviderConfig,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.model = config.model ?? 'text-embedding-004';
        this.id = `gemini-${this.model}`;

        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.embeddingModel = this.genAI.getGenerativeModel({ model: this.model });
        this.rateLimiter = rateLimiter;
        this.logger = logger;

        this.logger.debug('GeminiEmbeddingProvider initialized', {
            model: this.model,
            dimension: this.dimension
        });
    }

    /**
     * Generate embedding for text with specified task type
     */
    async embed(text: string, taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddingResult> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.embeddingModel.embedContent({
                content: { parts: [{ text }], role: 'user' },
                taskType: this.mapTaskType(taskType),
            });

            this.rateLimiter.reportSuccess();

            return {
                embedding: result.embedding.values,
                tokenCount: this.estimateTokenCount(text),
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
        const results: EmbeddingResult[] = [];

        for (const text of texts) {
            const result = await this.embed(text, taskType);
            results.push(result);
        }

        return results;
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
     * Map our task type to Gemini's TaskType enum
     */
    private mapTaskType(taskType: EmbeddingTaskType): TaskType {
        const mapping: Record<EmbeddingTaskType, TaskType> = {
            'RETRIEVAL_DOCUMENT': TaskType.RETRIEVAL_DOCUMENT,
            'RETRIEVAL_QUERY': TaskType.RETRIEVAL_QUERY,
            'SEMANTIC_SIMILARITY': TaskType.SEMANTIC_SIMILARITY,
            'CLASSIFICATION': TaskType.CLASSIFICATION,
            'CLUSTERING': TaskType.CLUSTERING,
        };
        return mapping[taskType];
    }

    /**
     * Estimate token count from text
     * Approximate: ~1 token per 4 characters for English
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
            throw new RateLimitError('Gemini Embedding API rate limit exceeded');
        }

        if (message.includes('quota')) {
            throw new GeminiAPIError('Embedding API quota exceeded', {
                statusCode: 429,
                retryable: false,
            });
        }

        this.logger.error('Gemini Embedding API error', {
            error: error.message,
        });
    }
}
