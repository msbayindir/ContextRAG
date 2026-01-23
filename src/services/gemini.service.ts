import { GoogleGenerativeAI, type GenerativeModel, type Part, type Content } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { z } from 'zod';
import { zodToGeminiSchema } from '../schemas/structured-output.schemas.js';
import type { ResolvedConfig } from '../types/config.types.js';
import type { TokenUsage } from '../types/chunk.types.js';
import { RateLimitError, GeminiAPIError, ContentPolicyError } from '../errors/index.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';
import { GENERATION_DEFAULTS } from '../config/constants.js';

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
 * 
 * Handles generation tasks. Embedding is delegated to EmbeddingProvider.
 */
export class GeminiService {
    private readonly genAI: GoogleGenerativeAI;
    private readonly fileManager: GoogleAIFileManager;
    private readonly model: GenerativeModel;
    private readonly config: ResolvedConfig;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: ResolvedConfig, rateLimiter: RateLimiter, logger: Logger) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.fileManager = new GoogleAIFileManager(config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.model });
        this.config = config;
        this.rateLimiter = rateLimiter;
        this.logger = logger;

        this.logger.debug('GeminiService initialized', {
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
                    temperature: GENERATION_DEFAULTS.SIMPLE.temperature,
                    maxOutputTokens: GENERATION_DEFAULTS.SIMPLE.maxOutputTokens,
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
     * Generate text for reranking tasks
     * Higher token limit for scoring multiple documents
     */
    async generateForReranking(prompt: string): Promise<string> {
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
                    temperature: GENERATION_DEFAULTS.RERANKING.temperature,
                    maxOutputTokens: GENERATION_DEFAULTS.RERANKING.maxOutputTokens,
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
        // Write buffer to temp file (FileManager requires file path)
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const tempPath = path.join(os.tmpdir(), `context-rag-${Date.now()}-${filename}`);

        try {
            fs.writeFileSync(tempPath, buffer);

            this.logger.info('Uploading PDF to Gemini Files API', { filename });

            const uploadResult = await this.fileManager.uploadFile(tempPath, {
                mimeType: 'application/pdf',
                displayName: filename,
            });

            this.logger.info('PDF uploaded successfully', {
                fileUri: uploadResult.file.uri,
                displayName: uploadResult.file.displayName,
            });

            return uploadResult.file.uri;
        } catch (error) {
            this.logger.error('Failed to upload PDF', { error: (error as Error).message });
            throw error;
        } finally {
            // Always cleanup temp file, even on error
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
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
                    temperature: options?.temperature ?? GENERATION_DEFAULTS.PDF_CONTEXT.temperature,
                    maxOutputTokens: options?.maxOutputTokens ?? GENERATION_DEFAULTS.PDF_CONTEXT.maxOutputTokens,
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
        contents: Content[],
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
        let lastError: Error | undefined;

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
                } catch (e: unknown) {
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

                lastError = error as Error;
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
     * Handle API errors with specific error types
     */
    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('Gemini API rate limit exceeded');
        }

        if (message.includes('quota')) {
            throw new GeminiAPIError('API quota exceeded', {
                statusCode: 429,
                retryable: false,
            });
        }

        if (message.includes('safety') || message.includes('blocked')) {
            throw new ContentPolicyError('Content blocked by safety filters', {
                originalError: error.message,
            });
        }

        if (message.includes('timeout') || message.includes('network')) {
            throw new GeminiAPIError('Network error', {
                retryable: true,
            });
        }

        this.logger.error('Gemini API error', {
            error: error.message,
        });
    }
}
