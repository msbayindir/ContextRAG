/**
 * Mock Index
 * 
 * Central export for all test mocks
 */

// Prisma
export { prismaMock, resetPrismaMock, setupPrismaDefaults, type MockPrismaClient } from './prisma.mock.js';

// Gemini
export {
    createMockGeminiService,
    createMockGeminiWithSections,
    createMockGeminiWithRateLimit,
    DEFAULT_TOKEN_USAGE,
    DEFAULT_EMBEDDING,
    type MockGeminiService,
} from './gemini.mock.js';

// Logger
export { createMockLogger, createVerboseMockLogger, type MockLogger } from './logger.mock.js';

// Fixtures
export {
    // Documents
    createMockDocument,
    createMockDocumentRecord,
    // Chunks
    createMockChunk,
    createMockChunkInput,
    createMockChunks,
    // Prompt Configs
    createMockPromptConfig,
    createMockPromptConfigRecord,
    // Search
    createMockSearchResult,
    createMockSearchResults,
    // Batches
    createMockBatchResult,
    createMockBatchRecord,
    // Token Usage
    createMockTokenUsage,
    // Config
    createMockResolvedConfig,
    // PDF
    createMockPdfBuffer,
    // Sections
    createMockSection,
    createMockSections,
} from './fixtures.js';
