import type { Part } from '@google/generative-ai';
import { z } from 'zod';
import type { ResolvedConfig } from '../types/config.types.js';
import type { TokenUsage } from '../types/chunk.types.js';
import type { ILLMService, LLMGenerateOptions, LLMResponse, LLMStructuredResult } from '../types/llm-service.types.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';
import { GENERATION_DEFAULTS } from '../config/constants.js';
import { GeminiApiClient } from './ai/gemini.client.js';
import { StructuredGenerator } from './ai/structured.generator.js';

/**
 * Response from Gemini API
 * @deprecated Use LLMResponse from llm-service.types.ts instead
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
 * 
 * This class implements the ILLMService interface for dependency injection,
 * enabling flexible LLM provider abstraction throughout the application.
 * 
 * **Architecture:**
 * - Delegates low-level API calls to GeminiApiClient
 * - Uses StructuredGenerator for JSON schema-based structured output
 * - Embedding is handled separately by EmbeddingProvider
 * 
 * **Key Features:**
 * - Document upload and caching via Gemini Files API
 * - Structured output generation with Zod schema validation
 * - Vision capabilities for multimodal processing
 * - Rate limiting and retry logic (via GeminiApiClient)
 * 
 * @implements {ILLMService}
 * @example
 * ```typescript
 * const gemini = new GeminiService(config, rateLimiter, logger);
 * 
 * // Simple generation
 * const response = await gemini.generate(systemPrompt, userContent);
 * 
 * // Structured output with Zod schema
 * const result = await gemini.generateStructured(prompt, MySchema);
 * 
 * // Document-based generation
 * const uri = await gemini.uploadDocument(pdfBuffer, 'doc.pdf');
 * const docResponse = await gemini.generateWithDocument(uri, prompt);
 * ```
 */
export class GeminiService implements ILLMService {
    private readonly apiClient: GeminiApiClient;
    private readonly structuredGenerator: StructuredGenerator;

    /**
     * Create a new GeminiService instance
     * 
     * @param config - Resolved configuration with model and generation settings
     * @param rateLimiter - Rate limiter for API call throttling
     * @param logger - Logger instance for debug and error logging
     * @param apiClient - Optional custom API client (for testing/custom implementations)
     * @param structuredGenerator - Optional custom structured generator (for testing)
     * 
     * @example
     * ```typescript
     * // Standard usage
     * const service = new GeminiService(resolvedConfig, rateLimiter, logger);
     * 
     * // With custom API client (for testing)
     * const mockClient = new MockGeminiApiClient();
     * const service = new GeminiService(config, rateLimiter, logger, mockClient);
     * ```
     */
    constructor(
        config: ResolvedConfig,
        rateLimiter: RateLimiter,
        logger: Logger,
        apiClient?: GeminiApiClient,
        structuredGenerator?: StructuredGenerator
    ) {
        this.apiClient = apiClient ?? new GeminiApiClient(config, rateLimiter, logger);
        this.structuredGenerator = structuredGenerator ?? new StructuredGenerator(this.apiClient, logger);

        logger.debug('GeminiService initialized (Refactored Facade)', {
            model: config.model,
        });
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
        // Delegate to API client
        return await this.apiClient.generateContent(
            [
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${userContent}` }],
                },
            ],
            options
        );
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
        // Delegate to API client
        return await this.apiClient.generateContent(
            [
                {
                    role: 'user',
                    parts: [{ text: systemPrompt }, ...parts],
                },
            ],
            options
        );
    }



    /**
     * Simple text generation (single prompt)
     * Used for context generation in RAG enhancement
     */
    async generateSimple(prompt: string): Promise<string> {
        return await this.apiClient.generateContent(
            [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            {
                temperature: GENERATION_DEFAULTS.SIMPLE.temperature,
                maxOutputTokens: GENERATION_DEFAULTS.SIMPLE.maxOutputTokens,
            }
        ).then(res => res.text.trim());
    }

    /**
     * Generate text for reranking tasks
     * Higher token limit for scoring multiple documents
     */
    async generateForReranking(prompt: string): Promise<string> {
        return await this.apiClient.generateContent(
            [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            {
                temperature: GENERATION_DEFAULTS.RERANKING.temperature,
                maxOutputTokens: GENERATION_DEFAULTS.RERANKING.maxOutputTokens,
            }
        ).then(res => res.text.trim());
    }

    /**
     * Upload document buffer to Gemini Files API
     * Returns file URI for use in subsequent requests
     * File is cached by Gemini for efficient reuse
     * @implements ILLMService.uploadDocument
     */
    async uploadDocument(buffer: Buffer, filename: string): Promise<string> {
        return this.apiClient.uploadPdfBuffer(buffer, filename);
    }

    /**
     * @deprecated Use uploadDocument instead
     */
    async uploadPdfBuffer(buffer: Buffer, filename: string): Promise<string> {
        return this.uploadDocument(buffer, filename);
    }

    /**
     * Generate content using uploaded document URI
     * Uses Gemini's file caching for efficient context generation
     * @implements ILLMService.generateWithDocument
     */
    async generateWithDocument(
        documentUri: string,
        prompt: string,
        options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        // Delegate to API Client
        return await this.apiClient.generateContent(
            [
                {
                    role: 'user',
                    parts: [
                        { fileData: { mimeType: 'application/pdf', fileUri: documentUri } },
                        { text: prompt },
                    ],
                },
            ],
            options
        );
    }

    /**
     * @deprecated Use generateWithDocument instead
     */
    async generateWithPdfUri(
        pdfUri: string,
        prompt: string,
        options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        return this.generateWithDocument(pdfUri, prompt, options);
    }

    /**
     * Generate structured data from text prompt
     * @implements ILLMService.generateStructured
     */
    async generateStructured<T>(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {


        return this.structuredGenerator.generate(
            prompt,
            schema,
            options
        );



    }

    /**
     * Generate structured data from uploaded document
     * @implements ILLMService.generateStructuredWithDocument
     */
    async generateStructuredWithDocument<T>(
        documentUri: string,
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        return this.structuredGenerator.generate(
            prompt,
            schema,
            { ...options, pdfUri: documentUri }
        );
    }

    /**
     * @deprecated Use generateStructuredWithDocument instead
     */
    async generateStructuredWithPdf<T>(
        pdfUri: string,
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        return this.generateStructuredWithDocument(pdfUri, prompt, schema, options);
    }



}
