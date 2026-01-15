import { GoogleGenerativeAI, type GenerativeModel, type Part, TaskType } from '@google/generative-ai';
import type { ResolvedConfig } from '../types/config.types.js';
import type { TokenUsage } from '../types/chunk.types.js';
import { RateLimitError } from '../errors/index.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';

/**
 * Response from Gemini API
 */
export interface GeminiResponse {
    text: string;
    tokenUsage: TokenUsage;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
    embedding: number[];
    tokenCount: number;
}

/**
 * Embedding task type for optimized embeddings
 * @see https://ai.google.dev/gemini-api/docs/embeddings
 */
export type EmbeddingTaskType =
    | 'RETRIEVAL_DOCUMENT'  // For documents to be indexed
    | 'RETRIEVAL_QUERY'     // For search queries
    | 'SEMANTIC_SIMILARITY' // For similarity comparison
    | 'CLASSIFICATION'      // For classification tasks
    | 'CLUSTERING';         // For clustering tasks

/**
 * Gemini API service wrapper
 */
export class GeminiService {
    private readonly genAI: GoogleGenerativeAI;
    private readonly model: GenerativeModel;
    private readonly embeddingModel: GenerativeModel;
    private readonly config: ResolvedConfig;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: ResolvedConfig, rateLimiter: RateLimiter, logger: Logger) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.model });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: config.embeddingModel });
        this.config = config;
        this.rateLimiter = rateLimiter;
        this.logger = logger;
    }

    /**
     * Generate text content
     */
    async generate(
        systemPrompt: string,
        userContent: string,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
        }
    ): Promise<GeminiResponse> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\n${userContent}` }],
                    },
                ],
                generationConfig: {
                    temperature: options?.temperature ?? this.config.generationConfig.temperature,
                    maxOutputTokens: options?.maxOutputTokens ?? this.config.generationConfig.maxOutputTokens,
                },
            });

            const response = result.response;
            const text = response.text();
            const usage = response.usageMetadata;

            this.rateLimiter.reportSuccess();

            return {
                text,
                tokenUsage: {
                    input: usage?.promptTokenCount ?? 0,
                    output: usage?.candidatesTokenCount ?? 0,
                    total: usage?.totalTokenCount ?? 0,
                },
            };
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Generate content with vision (PDF pages as images)
     */
    async generateWithVision(
        systemPrompt: string,
        parts: Part[],
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
        }
    ): Promise<GeminiResponse> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: systemPrompt }, ...parts],
                    },
                ],
                generationConfig: {
                    temperature: options?.temperature ?? this.config.generationConfig.temperature,
                    maxOutputTokens: options?.maxOutputTokens ?? this.config.generationConfig.maxOutputTokens,
                },
            });

            const response = result.response;
            const text = response.text();
            const usage = response.usageMetadata;

            this.rateLimiter.reportSuccess();

            return {
                text,
                tokenUsage: {
                    input: usage?.promptTokenCount ?? 0,
                    output: usage?.candidatesTokenCount ?? 0,
                    total: usage?.totalTokenCount ?? 0,
                },
            };
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Generate embeddings for text with task type
     * 
     * Best practices:
     * - Use RETRIEVAL_DOCUMENT for documents being indexed
     * - Use RETRIEVAL_QUERY for search queries
     * 
     * @see https://ai.google.dev/gemini-api/docs/embeddings
     */
    async embed(
        text: string,
        taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'
    ): Promise<EmbeddingResponse> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.embeddingModel.embedContent({
                content: { parts: [{ text }], role: 'user' },
                taskType: this.mapTaskType(taskType),
            });

            this.rateLimiter.reportSuccess();

            return {
                embedding: result.embedding.values,
                tokenCount: text.split(/\s+/).length, // Approximate
            };
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Generate embeddings for documents (for indexing)
     * Uses RETRIEVAL_DOCUMENT task type
     */
    async embedDocument(text: string): Promise<EmbeddingResponse> {
        return this.embed(text, 'RETRIEVAL_DOCUMENT');
    }

    /**
     * Generate embeddings for search query
     * Uses RETRIEVAL_QUERY task type
     */
    async embedQuery(text: string): Promise<EmbeddingResponse> {
        return this.embed(text, 'RETRIEVAL_QUERY');
    }

    /**
     * Generate embeddings for multiple documents (batch)
     * Uses RETRIEVAL_DOCUMENT task type
     */
    async embedBatch(texts: string[]): Promise<EmbeddingResponse[]> {
        const results: EmbeddingResponse[] = [];

        for (const text of texts) {
            const result = await this.embedDocument(text);
            results.push(result);
        }

        return results;
    }

    /**
     * Map our task type enum to Gemini's TaskType
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
     * Handle API errors
     */
    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('Gemini API rate limit exceeded');
        }

        this.logger.error('Gemini API error', {
            error: error.message,
        });
    }
}
