import { GoogleGenerativeAI, type GenerativeModel, type Part } from '@google/generative-ai';
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
 * Gemini API service wrapper
 */
export class GeminiService {
    private readonly genAI: GoogleGenerativeAI;
    private readonly model: GenerativeModel;
    private readonly embeddingModel: GenerativeModel;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: ResolvedConfig, rateLimiter: RateLimiter, logger: Logger) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.model });
        this.embeddingModel = this.genAI.getGenerativeModel({ model: config.embeddingModel });
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
                    temperature: options?.temperature ?? 0.3,
                    maxOutputTokens: options?.maxOutputTokens ?? 8192,
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
            throw error; // Re-throw after handling
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
                    temperature: options?.temperature ?? 0.3,
                    maxOutputTokens: options?.maxOutputTokens ?? 8192,
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
     * Generate embeddings for text
     */
    async embed(text: string): Promise<EmbeddingResponse> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.embeddingModel.embedContent(text);

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
     * Generate embeddings for multiple texts (batch)
     */
    async embedBatch(texts: string[]): Promise<EmbeddingResponse[]> {
        const results: EmbeddingResponse[] = [];

        for (const text of texts) {
            const result = await this.embed(text);
            results.push(result);
        }

        return results;
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
