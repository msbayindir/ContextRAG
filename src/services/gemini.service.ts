import { GoogleGenerativeAI, type GenerativeModel, type Part, TaskType } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { z } from 'zod';
import { zodToGeminiSchema } from '../schemas/structured-output.schemas.js';
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
    private readonly fileManager: GoogleAIFileManager;
    private readonly model: GenerativeModel;
    private readonly embeddingModel: GenerativeModel;
    private readonly config: ResolvedConfig;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: ResolvedConfig, rateLimiter: RateLimiter, logger: Logger) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.fileManager = new GoogleAIFileManager(config.geminiApiKey);
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
     * Simple text generation (single prompt)
     * Used for context generation in RAG enhancement
     */
    async generateSimple(prompt: string): Promise<string> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 200, // Short context
                },
            });

            this.rateLimiter.reportSuccess();
            return result.response.text().trim();
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Generate content with file reference (for contextual retrieval)
     * Uses Gemini's file caching for efficiency
     */
    async generateWithFileRef(fileUri: string, prompt: string): Promise<string> {
        await this.rateLimiter.acquire();

        try {
            const result = await this.model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { fileData: { mimeType: 'application/pdf', fileUri } },
                            { text: prompt },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 200,
                },
            });

            this.rateLimiter.reportSuccess();
            return result.response.text().trim();
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Upload PDF buffer to Gemini Files API
     * Returns file URI for use in subsequent requests
     * File is cached by Gemini for efficient reuse
     */
    async uploadPdfBuffer(buffer: Buffer, filename: string): Promise<string> {
        try {
            // Write buffer to temp file (FileManager requires file path)
            const fs = await import('fs');
            const path = await import('path');
            const os = await import('os');

            const tempPath = path.join(os.tmpdir(), `context-rag-${Date.now()}-${filename}`);
            fs.writeFileSync(tempPath, buffer);

            this.logger.info('Uploading PDF to Gemini Files API', { filename });

            const uploadResult = await this.fileManager.uploadFile(tempPath, {
                mimeType: 'application/pdf',
                displayName: filename,
            });

            // Cleanup temp file
            fs.unlinkSync(tempPath);

            this.logger.info('PDF uploaded successfully', {
                fileUri: uploadResult.file.uri,
                displayName: uploadResult.file.displayName,
            });

            return uploadResult.file.uri;
        } catch (error) {
            this.logger.error('Failed to upload PDF', { error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Generate content using uploaded PDF URI
     * Uses Gemini's file caching for efficient context generation
     */
    async generateWithPdfUri(
        pdfUri: string,
        prompt: string,
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
                        parts: [
                            { fileData: { mimeType: 'application/pdf', fileUri: pdfUri } },
                            { text: prompt },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: options?.temperature ?? 0.3,
                    maxOutputTokens: options?.maxOutputTokens ?? 200,
                },
            });

            const response = result.response;
            const text = response.text().trim();
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
     * Generate structured data from text prompt
     */
    async generateStructured<T>(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
        }
    ): Promise<{ data: T; tokenUsage: TokenUsage }> {


        return this.executeStructuredRetry(
            [{ role: 'user', parts: [{ text: prompt }] }],
            schema,
            options
        );



    }

    /**
     * Generate structured data from PDF
     */
    async generateStructuredWithPdf<T>(
        pdfUri: string,
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            maxRetries?: number;
        }
    ): Promise<{ data: T; tokenUsage: TokenUsage }> {
        return this.executeStructuredRetry(
            [
                {
                    role: 'user',
                    parts: [
                        { fileData: { mimeType: 'application/pdf', fileUri: pdfUri } },
                        { text: prompt },
                    ],
                },
            ],
            schema,
            options
        );
    }

    /**
     * Execute structured generation with retry logic
     */
    private async executeStructuredRetry<T>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            maxRetries?: number;
        }
    ): Promise<{ data: T; tokenUsage: TokenUsage }> {
        const maxRetries = options?.maxRetries ?? 2;
        let attempt = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let lastError: any;

        // Clone contents to build conversation history for feedback loop
        const currentContents = [...contents];

        while (attempt <= maxRetries) {
            attempt++;
            await this.rateLimiter.acquire();

            try {
                const result = await this.model.generateContent({
                    contents: currentContents,
                    generationConfig: {
                        responseMimeType: 'application/json',
                        // Cast to any because the new schema format might have slight type mismatch 
                        // but is valid for the API
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        responseSchema: zodToGeminiSchema(schema) as any,
                        temperature: options?.temperature ?? 0.2,
                        maxOutputTokens: options?.maxOutputTokens,
                    },
                });

                const response = result.response;
                const text = response.text();
                const usage = response.usageMetadata;

                this.rateLimiter.reportSuccess();

                try {
                    const parsed = JSON.parse(text);
                    const data = schema.parse(parsed);
                    return {
                        data,
                        tokenUsage: {
                            input: usage?.promptTokenCount ?? 0,
                            output: usage?.candidatesTokenCount ?? 0,
                            total: usage?.totalTokenCount ?? 0,
                        }
                    };
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (e: any) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    // Create a brief snippet of the invalid JSON for debugging
                    const snippet = text.length > 500 ? text.substring(0, 200) + '...[truncated]...' + text.substring(text.length - 200) : text;

                    this.logger.warn(`Structured validation failed (attempt ${attempt}/${maxRetries + 1})`, {
                        error: errorMessage,
                        snippet: text.substring(0, 100)
                    });

                    lastError = new Error(`Structured output validation failed: ${errorMessage}. Raw response snippet: ${snippet}`);

                    if (attempt <= maxRetries) {
                        // FEEDBACK LOOP: Add the failed response and the error message to history
                        // This simulates a "human" pointing out the error to the AI
                        currentContents.push({
                            role: 'model',
                            parts: [{ text: text }]
                        });

                        currentContents.push({
                            role: 'user',
                            parts: [{ text: `JSON Validation Error: ${errorMessage}\n\nPlease fix the JSON output to match the schema exactly.` }]
                        });

                        continue;
                    }
                    throw lastError;
                }
            } catch (error) {
                this.handleError(error as Error);

                lastError = error;
                if (attempt <= maxRetries) {
                    this.logger.warn(`Gemini API error (attempt ${attempt}/${maxRetries + 1}), retrying...`, { error: (error as Error).message });
                    // For network/API errors, we DO NOT update history, just retry the request
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
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
