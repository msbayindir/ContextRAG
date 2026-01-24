/**
 * Mock Gemini Service
 * 
 * Provides type-safe mocks for all GeminiService and ILLMService methods.
 * Returns sensible defaults that can be overridden per test.
 */

import { vi } from 'vitest';
import type { GeminiService, GeminiResponse, EmbeddingResponse } from '../../src/services/gemini.service.js';
import type { ILLMService } from '../../src/types/llm-service.types.js';
import type { TokenUsage } from '../../src/types/chunk.types.js';

// Default token usage for mocked responses
export const DEFAULT_TOKEN_USAGE: TokenUsage = {
    input: 100,
    output: 50,
    total: 150,
};

// Default embedding (768 dimensions for Gemini)
export const DEFAULT_EMBEDDING = new Array(768).fill(0.1);

/**
 * Mock GeminiService type
 */
export type MockGeminiService = {
    [K in keyof GeminiService]: ReturnType<typeof vi.fn>;
};

/**
 * Create a fresh mock GeminiService instance
 */
export function createMockGeminiService(): MockGeminiService {
    return {
        // Text generation
        generate: vi.fn().mockResolvedValue({
            text: 'Mock generated response',
            tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        } as GeminiResponse),

        generateWithVision: vi.fn().mockResolvedValue({
            text: 'Mock vision response',
            tokenUsage: { input: 200, output: 100, total: 300 },
        } as GeminiResponse),

        generateSimple: vi.fn().mockResolvedValue('Mock simple response'),

        generateForReranking: vi.fn().mockResolvedValue(JSON.stringify([
            { id: 'chunk-1', score: 0.9, reason: 'Highly relevant' },
            { id: 'chunk-2', score: 0.7, reason: 'Somewhat relevant' },
        ])),

        generateWithFileRef: vi.fn().mockResolvedValue('Mock file ref response'),

        // PDF operations
        uploadDocument: vi.fn().mockResolvedValue('files/mock-file-id-12345'),
        uploadPdfBuffer: vi.fn().mockResolvedValue('files/mock-file-id-12345'),

        generateWithDocument: vi.fn().mockResolvedValue({
            text: `<!-- SECTION type="TEXT" page="1" confidence="0.92" -->
Mock extracted content from PDF.
This is a sample paragraph that was extracted.
<!-- /SECTION -->`,
            tokenUsage: { input: 500, output: 200, total: 700 },
        } as GeminiResponse),

        generateWithPdfUri: vi.fn().mockResolvedValue({
            text: `<!-- SECTION type="TEXT" page="1" confidence="0.92" -->
Mock extracted content from PDF.
This is a sample paragraph that was extracted.
<!-- /SECTION -->

<!-- SECTION type="TABLE" page="2" confidence="0.88" -->
| Column A | Column B |
|----------|----------|
| Value 1  | Value 2  |
<!-- /SECTION -->`,
            tokenUsage: { input: 500, output: 200, total: 700 },
        } as GeminiResponse),

        // Embeddings
        embed: vi.fn().mockResolvedValue({
            embedding: [...DEFAULT_EMBEDDING],
            tokenCount: 10,
        } as EmbeddingResponse),

        embedDocument: vi.fn().mockResolvedValue({
            embedding: [...DEFAULT_EMBEDDING],
            tokenCount: 10,
        } as EmbeddingResponse),

        embedQuery: vi.fn().mockResolvedValue({
            embedding: [...DEFAULT_EMBEDDING],
            tokenCount: 8,
        } as EmbeddingResponse),

        embedBatch: vi.fn().mockImplementation((texts: string[]) =>
            Promise.resolve(
                texts.map(() => ({
                    embedding: [...DEFAULT_EMBEDDING],
                    tokenCount: 10,
                } as EmbeddingResponse))
            )
        ),

        // Structured output
        generateStructured: vi.fn().mockResolvedValue({
            data: [],
            tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        }),

        generateStructuredWithDocument: vi.fn().mockResolvedValue({
            data: [
                {
                    type: 'TEXT',
                    page: 1,
                    confidence: 0.92,
                    content: 'Mock extracted content from structured output.',
                },
            ],
            tokenUsage: { input: 500, output: 200, total: 700 },
        }),

        generateStructuredWithPdf: vi.fn().mockResolvedValue({
            data: [
                {
                    type: 'TEXT',
                    page: 1,
                    confidence: 0.92,
                    content: 'Mock extracted content from structured output.',
                },
            ],
            tokenUsage: { input: 500, output: 200, total: 700 },
        }),

        // Embedding provider access
        getEmbeddingProvider: vi.fn().mockReturnValue({
            id: 'gemini-text-embedding-004',
            dimension: 768,
            model: 'text-embedding-004',
            embed: vi.fn().mockResolvedValue({ embedding: [...DEFAULT_EMBEDDING], tokenCount: 10 }),
            embedBatch: vi.fn().mockImplementation((texts: string[]) =>
                Promise.resolve(texts.map(() => ({ embedding: [...DEFAULT_EMBEDDING], tokenCount: 10 })))
            ),
            embedDocument: vi.fn().mockResolvedValue({ embedding: [...DEFAULT_EMBEDDING], tokenCount: 10 }),
            embedQuery: vi.fn().mockResolvedValue({ embedding: [...DEFAULT_EMBEDDING], tokenCount: 8 }),
        }),
    };
}

/**
 * Create a mock that simulates extraction with multiple sections
 */
export function createMockGeminiWithSections(sections: Array<{
    type: string;
    page: number;
    confidence: number;
    content: string;
}>): MockGeminiService {
    const mock = createMockGeminiService();

    mock.generateStructuredWithDocument.mockResolvedValue({
        data: sections,
        tokenUsage: { input: 500, output: 200, total: 700 },
    });

    mock.generateStructuredWithPdf.mockResolvedValue({
        data: sections,
        tokenUsage: { input: 500, output: 200, total: 700 },
    });

    return mock;
}

/**
 * Create a mock that simulates rate limit errors
 */
export function createMockGeminiWithRateLimit(): MockGeminiService {
    const mock = createMockGeminiService();

    // First call fails with rate limit, subsequent calls succeed
    let callCount = 0;
    mock.generateWithDocument.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
            return Promise.reject(new Error('429 Too Many Requests'));
        }
        return Promise.resolve({
            text: 'Success after retry',
            tokenUsage: { input: 100, output: 50, total: 150 },
        });
    });
    mock.generateWithPdfUri.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
            return Promise.reject(new Error('429 Too Many Requests'));
        }
        return Promise.resolve({
            text: 'Success after retry',
            tokenUsage: { input: 100, output: 50, total: 150 },
        });
    });

    return mock;
}

/**
 * Mock ILLMService type (v2.0 interface)
 * 
 * Use this for testing components that depend on ILLMService interface.
 */
export type MockLLMService = {
    [K in keyof ILLMService]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock ILLMService implementation
 * 
 * Follows the ILLMService interface for v2.0 dependency injection.
 * Suitable for testing engines and services that depend on ILLMService.
 * 
 * @example
 * ```typescript
 * const mockLLM = createMockLLMService();
 * const engine = new IngestionEngine(config, { llm: mockLLM, ... }, logger);
 * 
 * // Customize behavior
 * mockLLM.generateStructuredWithDocument.mockResolvedValue({
 *   data: customData,
 *   tokenUsage: { input: 100, output: 50, total: 150 },
 * });
 * ```
 */
export function createMockLLMService(): MockLLMService {
    return {
        generate: vi.fn().mockResolvedValue({
            text: 'Mock generated response',
            tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        }),

        generateWithVision: vi.fn().mockResolvedValue({
            text: 'Mock vision response',
            tokenUsage: { input: 200, output: 100, total: 300 },
        }),

        generateSimple: vi.fn().mockResolvedValue('Mock simple response'),

        generateForReranking: vi.fn().mockResolvedValue(JSON.stringify([
            { id: 'chunk-1', score: 0.9, reason: 'Highly relevant' },
            { id: 'chunk-2', score: 0.7, reason: 'Somewhat relevant' },
        ])),

        uploadDocument: vi.fn().mockResolvedValue('files/mock-file-id-12345'),

        generateWithDocument: vi.fn().mockResolvedValue({
            text: 'Mock document response',
            tokenUsage: { input: 500, output: 200, total: 700 },
        }),

        generateStructured: vi.fn().mockResolvedValue({
            data: [],
            tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        }),

        generateStructuredWithDocument: vi.fn().mockResolvedValue({
            data: [
                {
                    type: 'TEXT',
                    page: 1,
                    confidence: 0.92,
                    content: 'Mock extracted content from structured output.',
                },
            ],
            tokenUsage: { input: 500, output: 200, total: 700 },
        }),
    };
}
