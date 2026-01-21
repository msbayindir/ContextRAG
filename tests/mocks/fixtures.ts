/**
 * Test Fixtures
 * 
 * Factory functions for creating test data.
 * Uses @faker-js/faker for realistic random data generation.
 */

import { faker } from '@faker-js/faker';
import type { DocumentStatus, BatchResult } from '../../src/types/ingestion.types.js';
import type { VectorChunk, TokenUsage, CreateChunkInput } from '../../src/types/chunk.types.js';
import type { PromptConfig } from '../../src/types/prompt.types.js';
import type { SearchResult } from '../../src/types/search.types.js';
import type { ResolvedConfig } from '../../src/types/config.types.js';
import { prismaMock } from './prisma.mock.js';

// ========================================
// DOCUMENT FIXTURES
// ========================================

export interface MockDocumentOptions {
    id?: string;
    filename?: string;
    status?: DocumentStatus['status'];
    pageCount?: number;
    failedBatches?: number;
}

export function createMockDocument(overrides?: Partial<DocumentStatus>): DocumentStatus {
    const totalBatches = overrides?.progress?.totalBatches ?? faker.number.int({ min: 1, max: 10 });
    const completedBatches = overrides?.progress?.completedBatches ?? totalBatches;
    const failedBatches = overrides?.progress?.failedBatches ?? 0;

    return {
        id: faker.string.uuid(),
        filename: faker.system.fileName({ extensionCount: 1 }) + '.pdf',
        status: 'COMPLETED',
        documentType: 'General',
        pageCount: faker.number.int({ min: 1, max: 100 }),
        progress: {
            totalBatches,
            completedBatches,
            failedBatches,
            percentage: totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0,
        },
        tokenUsage: createMockTokenUsage(),
        processingMs: faker.number.int({ min: 1000, max: 30000 }),
        createdAt: faker.date.recent(),
        completedAt: faker.date.recent(),
        ...overrides,
    };
}

export function createMockDocumentRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
        id: faker.string.uuid(),
        filename: 'test.pdf',
        fileHash: faker.string.alphanumeric(64),
        fileSize: faker.number.int({ min: 1000, max: 10000000 }),
        pageCount: faker.number.int({ min: 1, max: 100 }),
        documentType: 'General',
        status: 'COMPLETED',
        totalBatches: 3,
        completedBatches: 3,
        failedBatches: 0,
        tokenUsage: { input: 1000, output: 500, total: 1500 },
        processingMs: 5000,
        createdAt: new Date(),
        completedAt: new Date(),
        ...overrides,
    };
}

// ========================================
// CHUNK FIXTURES
// ========================================

export function createMockChunk(overrides?: Partial<VectorChunk>): VectorChunk {
    const pageNum = faker.number.int({ min: 1, max: 50 });

    return {
        id: faker.string.uuid(),
        promptConfigId: faker.string.uuid(),
        documentId: faker.string.uuid(),
        chunkIndex: faker.number.int({ min: 0, max: 100 }),
        chunkType: 'TEXT',
        searchContent: faker.lorem.paragraph(),
        displayContent: faker.lorem.paragraphs(2),
        sourcePageStart: pageNum,
        sourcePageEnd: pageNum,
        confidenceScore: faker.number.float({ min: 0.7, max: 1.0, fractionDigits: 2 }),
        metadata: {
            type: 'TEXT',
            pageRange: { start: pageNum, end: pageNum },
            confidence: { score: 0.9, category: 'HIGH' as const },
        },
        createdAt: faker.date.recent(),
        ...overrides,
    };
}

export function createMockChunkInput(overrides?: Partial<CreateChunkInput>): CreateChunkInput {
    const pageNum = faker.number.int({ min: 1, max: 50 });

    return {
        promptConfigId: faker.string.uuid(),
        documentId: faker.string.uuid(),
        chunkIndex: faker.number.int({ min: 0, max: 100 }),
        chunkType: 'TEXT',
        searchContent: faker.lorem.paragraph(),
        displayContent: faker.lorem.paragraphs(2),
        sourcePageStart: pageNum,
        sourcePageEnd: pageNum,
        confidenceScore: 0.9,
        metadata: {
            type: 'TEXT',
            pageRange: { start: pageNum, end: pageNum },
            confidence: { score: 0.9, category: 'HIGH' },
        },
        ...overrides,
    };
}

export function createMockChunks(count: number, documentId?: string): VectorChunk[] {
    const docId = documentId ?? faker.string.uuid();
    return Array.from({ length: count }, (_, i) =>
        createMockChunk({
            documentId: docId,
            chunkIndex: i,
            sourcePageStart: Math.floor(i / 3) + 1,
            sourcePageEnd: Math.floor(i / 3) + 1,
        })
    );
}

// ========================================
// PROMPT CONFIG FIXTURES
// ========================================

export function createMockPromptConfig(overrides?: Partial<PromptConfig>): PromptConfig {
    return {
        id: faker.string.uuid(),
        documentType: 'General',
        name: 'Test Extraction Config',
        systemPrompt: 'Extract all content preserving structure and formatting.',
        chunkStrategy: {
            maxTokens: 800,
            overlapTokens: 50,
            splitBy: 'semantic' as const,
            preserveTables: true,
            preserveLists: true,
        },
        version: 1,
        isActive: true,
        isDefault: true,
        createdBy: 'test',
        changeLog: 'Test configuration',
        createdAt: faker.date.recent(),
        updatedAt: faker.date.recent(),
        ...overrides,
    };
}

export function createMockPromptConfigRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
        id: faker.string.uuid(),
        documentType: 'General',
        name: 'Test Config',
        systemPrompt: 'Extract content.',
        chunkStrategy: { maxTokens: 800, splitBy: 'semantic', preserveTables: true, preserveLists: true },
        version: 1,
        isActive: true,
        isDefault: true,
        createdBy: 'test',
        changeLog: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ========================================
// SEARCH RESULT FIXTURES
// ========================================

export function createMockSearchResult(overrides?: Partial<SearchResult>): SearchResult {
    const chunk = createMockChunk();

    return {
        chunk,
        score: faker.number.float({ min: 0.5, max: 1.0, fractionDigits: 3 }),
        ...overrides,
    };
}

export function createMockSearchResults(count: number): SearchResult[] {
    return Array.from({ length: count }, (_, i) =>
        createMockSearchResult({
            score: 1 - i * 0.1, // Decreasing scores
        })
    );
}

// ========================================
// BATCH FIXTURES
// ========================================

export function createMockBatchResult(overrides?: Partial<BatchResult>): BatchResult {
    return {
        batchIndex: faker.number.int({ min: 0, max: 10 }),
        status: 'COMPLETED',
        chunksCreated: faker.number.int({ min: 3, max: 15 }),
        tokenUsage: createMockTokenUsage(),
        processingMs: faker.number.int({ min: 1000, max: 10000 }),
        retryCount: 0,
        ...overrides,
    };
}

export function createMockBatchRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
    return {
        id: faker.string.uuid(),
        documentId: faker.string.uuid(),
        batchIndex: 0,
        pageStart: 1,
        pageEnd: 15,
        status: 'PENDING',
        retryCount: 0,
        lastError: null,
        tokenUsage: null,
        processingMs: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ========================================
// TOKEN USAGE FIXTURES
// ========================================

export function createMockTokenUsage(overrides?: Partial<TokenUsage>): TokenUsage {
    const input = overrides?.input ?? faker.number.int({ min: 500, max: 5000 });
    const output = overrides?.output ?? faker.number.int({ min: 200, max: 2000 });

    return {
        input,
        output,
        total: overrides?.total ?? input + output,
    };
}

// ========================================
// CONFIG FIXTURES
// ========================================

export function createMockResolvedConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
    return {
        prisma: prismaMock,
        geminiApiKey: 'test-api-key',
        model: 'gemini-1.5-flash',
        embeddingModel: 'text-embedding-004',
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
        },
        batchConfig: {
            pagesPerBatch: 15,
            maxConcurrency: 3,
            maxRetries: 3,
            retryDelayMs: 100, // Fast for tests
            backoffMultiplier: 2,
        },
        chunkConfig: {
            maxTokens: 500,
            overlapTokens: 50,
        },
        rateLimitConfig: {
            requestsPerMinute: 1000, // High for tests
            adaptive: false,
        },
        logging: {
            level: 'error', // Quiet during tests
            structured: false,
        },
        useStructuredOutput: true,
        rerankingConfig: {
            enabled: false,
            provider: 'gemini',
            defaultCandidates: 50,
            defaultTopK: 10,
        },
        ...overrides,
    };
}

// ========================================
// PDF BUFFER FIXTURE
// ========================================

export function createMockPdfBuffer(): Buffer {
    // Minimal valid PDF structure
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;
    return Buffer.from(pdfContent);
}

// ========================================
// SECTION FIXTURES (for structured output)
// ========================================

export function createMockSection(overrides?: {
    type?: string;
    page?: number;
    confidence?: number;
    content?: string;
}): { type: string; page: number; confidence: number; content: string } {
    return {
        type: overrides?.type ?? 'TEXT',
        page: overrides?.page ?? 1,
        confidence: overrides?.confidence ?? 0.9,
        content: overrides?.content ?? faker.lorem.paragraph(),
    };
}

export function createMockSections(count: number): Array<{ type: string; page: number; confidence: number; content: string }> {
    return Array.from({ length: count }, (_, i) =>
        createMockSection({
            page: Math.floor(i / 3) + 1,
            confidence: 0.9 - i * 0.02,
        })
    );
}
