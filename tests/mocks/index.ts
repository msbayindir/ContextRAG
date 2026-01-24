/**
 * Mock Index
 * 
 * Central export for all test mocks
 */

// Prisma
export { prismaMock, resetPrismaMock, setupPrismaDefaults, type MockPrismaClient } from './prisma.mock.js';

// Gemini / LLM Service
export {
    createMockGeminiService,
    createMockGeminiWithSections,
    createMockGeminiWithRateLimit,
    createMockLLMService,
    DEFAULT_TOKEN_USAGE,
    DEFAULT_EMBEDDING,
    type MockGeminiService,
    type MockLLMService,
} from './gemini.mock.js';

// PDF Processor
export {
    createMockPDFProcessor,
    createMockPDFProcessorWithPages,
    createMockPDFProcessorWithError,
    DEFAULT_PDF_METADATA,
    type MockPDFProcessor,
} from './pdf-processor.mock.js';

// Repositories
export {
    createMockDocumentRepository,
    createMockBatchRepository,
    createMockChunkRepository,
    createMockPromptConfigRepository,
    createMockRepositories,
    type MockDocumentRepository,
    type MockBatchRepository,
    type MockChunkRepository,
    type MockPromptConfigRepository,
} from './repository.mock.js';

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
