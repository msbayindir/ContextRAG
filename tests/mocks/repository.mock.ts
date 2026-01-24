/**
 * Mock Repository Implementations
 * 
 * Provides type-safe mocks for repository interfaces (v2.0).
 * Returns sensible defaults that can be overridden per test.
 */

import { vi } from 'vitest';
import type { 
    IDocumentRepository, 
    IBatchRepository, 
    IChunkRepository, 
    IPromptConfigRepository 
} from '../../src/types/repository.types.js';

/**
 * Mock IDocumentRepository type
 */
export type MockDocumentRepository = {
    [K in keyof IDocumentRepository]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock IDocumentRepository implementation
 */
export function createMockDocumentRepository(): MockDocumentRepository {
    return {
        create: vi.fn().mockResolvedValue({
            id: 'doc-mock-id',
            filename: 'test.pdf',
            pageCount: 10,
            status: 'processing',
            createdAt: new Date(),
            updatedAt: new Date(),
        }),

        findById: vi.fn().mockResolvedValue({
            id: 'doc-mock-id',
            filename: 'test.pdf',
            pageCount: 10,
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
        }),

        findMany: vi.fn().mockResolvedValue([]),

        update: vi.fn().mockResolvedValue({
            id: 'doc-mock-id',
            filename: 'test.pdf',
            pageCount: 10,
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
        }),

        delete: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock IBatchRepository type
 */
export type MockBatchRepository = {
    [K in keyof IBatchRepository]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock IBatchRepository implementation
 */
export function createMockBatchRepository(): MockBatchRepository {
    return {
        create: vi.fn().mockResolvedValue({
            id: 'batch-mock-id',
            documentId: 'doc-mock-id',
            startPage: 1,
            endPage: 15,
            status: 'pending',
            createdAt: new Date(),
        }),

        createMany: vi.fn().mockResolvedValue({ count: 1 }),

        findByDocument: vi.fn().mockResolvedValue([]),

        update: vi.fn().mockResolvedValue({
            id: 'batch-mock-id',
            documentId: 'doc-mock-id',
            startPage: 1,
            endPage: 15,
            status: 'completed',
            createdAt: new Date(),
        }),

        deleteByDocument: vi.fn().mockResolvedValue({ count: 0 }),
    };
}

/**
 * Mock IChunkRepository type
 */
export type MockChunkRepository = {
    [K in keyof IChunkRepository]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock IChunkRepository implementation
 */
export function createMockChunkRepository(): MockChunkRepository {
    return {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),

        findByDocument: vi.fn().mockResolvedValue([]),

        findByIds: vi.fn().mockResolvedValue([]),

        searchByVector: vi.fn().mockResolvedValue([]),

        deleteByDocument: vi.fn().mockResolvedValue({ count: 0 }),

        countByDocument: vi.fn().mockResolvedValue(0),
    };
}

/**
 * Mock IPromptConfigRepository type
 */
export type MockPromptConfigRepository = {
    [K in keyof IPromptConfigRepository]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock IPromptConfigRepository implementation
 */
export function createMockPromptConfigRepository(): MockPromptConfigRepository {
    return {
        create: vi.fn().mockResolvedValue({
            id: 'prompt-mock-id',
            name: 'Test Prompt',
            systemPrompt: 'You are a helpful assistant.',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),

        findById: vi.fn().mockResolvedValue(null),

        findActive: vi.fn().mockResolvedValue(null),

        findMany: vi.fn().mockResolvedValue([]),

        update: vi.fn().mockResolvedValue({
            id: 'prompt-mock-id',
            name: 'Test Prompt',
            systemPrompt: 'Updated prompt.',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),

        delete: vi.fn().mockResolvedValue(undefined),

        activate: vi.fn().mockResolvedValue({
            id: 'prompt-mock-id',
            name: 'Test Prompt',
            systemPrompt: 'You are a helpful assistant.',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
    };
}

/**
 * Create all repository mocks bundled together
 * 
 * Useful for creating IngestionEngineDependencies or ContextRAGDependencies
 * 
 * @example
 * ```typescript
 * const repos = createMockRepositories();
 * const deps: IngestionEngineDependencies = {
 *   llm: mockLLM,
 *   pdfProcessor: mockPDF,
 *   embeddingProvider: mockEmbedding,
 *   repositories: repos,
 * };
 * ```
 */
export function createMockRepositories() {
    return {
        document: createMockDocumentRepository(),
        batch: createMockBatchRepository(),
        chunk: createMockChunkRepository(),
        promptConfig: createMockPromptConfigRepository(),
    };
}
