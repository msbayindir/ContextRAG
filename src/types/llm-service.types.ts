import type { Part } from '@google/generative-ai';
import type { z } from 'zod';
import type { TokenUsage } from './chunk.types.js';

/**
 * LLM generation options
 */
export interface LLMGenerateOptions {
    /** Temperature for response randomness (0.0 - 2.0) */
    temperature?: number;
    /** Maximum tokens in response */
    maxOutputTokens?: number;
    /** Maximum retry attempts for structured output */
    maxRetries?: number;
}

/**
 * Response from LLM generation
 */
export interface LLMResponse {
    /** Generated text content */
    text: string;
    /** Token usage statistics */
    tokenUsage: TokenUsage;
}

/**
 * Result of structured data generation
 */
export interface LLMStructuredResult<T> {
    /** Parsed and validated data */
    data: T;
    /** Token usage statistics */
    tokenUsage: TokenUsage;
}

/**
 * Generic LLM Service Interface
 * 
 * Abstraction over language model providers (Gemini, OpenAI, Anthropic, etc.)
 * Allows swapping LLM providers without changing consumer code.
 * 
 * @example
 * ```typescript
 * // Using the interface
 * class MyEngine {
 *   constructor(private llm: ILLMService) {}
 *   
 *   async process() {
 *     const response = await this.llm.generate('System prompt', 'User input');
 *     return response.text;
 *   }
 * }
 * ```
 */
export interface ILLMService {
    /**
     * Generate text content with system and user prompts
     * @param systemPrompt - System/context prompt
     * @param userContent - User input content
     * @param options - Generation options
     * @returns Generated response with token usage
     */
    generate(
        systemPrompt: string,
        userContent: string,
        options?: LLMGenerateOptions
    ): Promise<LLMResponse>;

    /**
     * Generate content with vision capabilities (images, PDF pages)
     * @param systemPrompt - System/context prompt
     * @param parts - Content parts including images/files
     * @param options - Generation options
     * @returns Generated response with token usage
     */
    generateWithVision(
        systemPrompt: string,
        parts: Part[],
        options?: LLMGenerateOptions
    ): Promise<LLMResponse>;

    /**
     * Simple text generation from a single prompt
     * Used for context generation in RAG enhancement
     * @param prompt - Single prompt text
     * @returns Generated text
     */
    generateSimple(prompt: string): Promise<string>;

    /**
     * Generate text optimized for reranking tasks
     * Higher token limit for scoring multiple documents
     * @param prompt - Reranking prompt
     * @returns Generated ranking text
     */
    generateForReranking(prompt: string): Promise<string>;

    /**
     * Upload a document buffer to the LLM provider
     * Returns a URI/reference for use in subsequent requests
     * @param buffer - Document buffer (e.g., PDF)
     * @param filename - Original filename
     * @returns File URI for provider-specific reference
     */
    uploadDocument(buffer: Buffer, filename: string): Promise<string>;

    /**
     * Generate content using an uploaded document reference
     * Uses provider's file caching for efficient processing
     * @param documentUri - URI from uploadDocument
     * @param prompt - Generation prompt
     * @param options - Generation options
     * @returns Generated response with token usage
     */
    generateWithDocument(
        documentUri: string,
        prompt: string,
        options?: LLMGenerateOptions
    ): Promise<LLMResponse>;

    /**
     * Generate and validate structured data from text prompt
     * @param prompt - Generation prompt
     * @param schema - Zod schema for validation
     * @param options - Generation options
     * @returns Validated structured data with token usage
     */
    generateStructured<T>(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>>;

    /**
     * Generate structured data from an uploaded document
     * @param documentUri - URI from uploadDocument
     * @param prompt - Generation prompt
     * @param schema - Zod schema for validation
     * @param options - Generation options
     * @returns Validated structured data with token usage
     */
    generateStructuredWithDocument<T>(
        documentUri: string,
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>>;
}
