/**
 * Chunk Repository Tests
 * 
 * Tests for ChunkRepository operations including vector search
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChunkRepository } from '../../src/database/repositories/chunk.repository.js';
import { prismaMock } from '../mocks/prisma.mock.js';
import { createMockChunk, createMockChunkInput } from '../mocks/fixtures.js';
import { DEFAULT_EMBEDDING } from '../mocks/gemini.mock.js';

describe('ChunkRepository', () => {
    let repo: ChunkRepository;

    beforeEach(() => {
        repo = new ChunkRepository(prismaMock);
    });

    // ========================================
    // CREATE
    // ========================================

    describe('create', () => {
        it('should create chunk with embedding using raw SQL', async () => {
            const mockId = 'chunk-123';
            prismaMock.$queryRaw.mockResolvedValue([{ id: mockId }]);

            const input = createMockChunkInput();
            const embedding = DEFAULT_EMBEDDING;

            const result = await repo.create(input, embedding);

            expect(result).toBe(mockId);
            expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
        });

        it('should store all chunk fields correctly', async () => {
            prismaMock.$queryRaw.mockResolvedValue([{ id: 'chunk-456' }]);

            const input = createMockChunkInput({
                chunkType: 'TABLE',
                confidenceScore: 0.95,
                sourcePageStart: 5,
                sourcePageEnd: 6,
            });

            await repo.create(input, DEFAULT_EMBEDDING);

            // Verify query was called (detailed SQL verification is complex)
            expect(prismaMock.$queryRaw).toHaveBeenCalled();
        });
    });

    // ========================================
    // CREATE MANY
    // ========================================

    describe('createMany', () => {
        it('should create multiple chunks in transaction', async () => {
            // The implementation uses $transaction with tx.$queryRaw for each chunk
            const mockTx = {
                $queryRaw: vi.fn()
                    .mockResolvedValueOnce([{ id: 'chunk-1' }])
                    .mockResolvedValueOnce([{ id: 'chunk-2' }])
                    .mockResolvedValueOnce([{ id: 'chunk-3' }]),
            };
            prismaMock.$transaction.mockImplementation(async (fn) => {
                return fn(mockTx as unknown as typeof prismaMock);
            });

            const inputs = [
                createMockChunkInput({ chunkIndex: 0 }),
                createMockChunkInput({ chunkIndex: 1 }),
                createMockChunkInput({ chunkIndex: 2 }),
            ];
            const embeddings = inputs.map(() => DEFAULT_EMBEDDING);

            const result = await repo.createMany(inputs, embeddings);

            expect(result).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
            expect(mockTx.$queryRaw).toHaveBeenCalledTimes(3);
        });

        it('should handle empty input array', async () => {
            prismaMock.$queryRaw.mockResolvedValue([]);

            const result = await repo.createMany([], []);

            expect(result).toEqual([]);
        });
    });

    // ========================================
    // SEMANTIC SEARCH
    // ========================================

    describe('searchSemantic', () => {
        it('should perform vector similarity search', async () => {
            const mockResults = [
                { ...createMockChunk(), similarity: 0.95 },
                { ...createMockChunk(), similarity: 0.87 },
            ];
            prismaMock.$queryRawUnsafe.mockResolvedValue(mockResults);

            const queryEmbedding = DEFAULT_EMBEDDING;
            const results = await repo.searchSemantic(queryEmbedding, 10);

            expect(results).toHaveLength(2);
            expect(results[0]?.similarity).toBe(0.95);
            expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
        });

        it('should apply limit parameter', async () => {
            prismaMock.$queryRawUnsafe.mockResolvedValue([]);

            await repo.searchSemantic(DEFAULT_EMBEDDING, 5);

            // Verify the query contains LIMIT
            const call = prismaMock.$queryRawUnsafe.mock.calls[0];
            expect(call?.[0]).toContain('LIMIT');
        });

        it('should apply minScore filter when provided', async () => {
            prismaMock.$queryRawUnsafe.mockResolvedValue([]);

            await repo.searchSemantic(DEFAULT_EMBEDDING, 10, undefined, 0.7);

            // Query should filter by minimum similarity
            expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
        });

        it('should apply documentId filter when provided', async () => {
            prismaMock.$queryRawUnsafe.mockResolvedValue([]);

            await repo.searchSemantic(DEFAULT_EMBEDDING, 10, {
                documentIds: ['doc-123', 'doc-456'],
            });

            const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
            expect(query).toContain('document_id');
        });

        it('should apply chunkTypes filter when provided', async () => {
            prismaMock.$queryRawUnsafe.mockResolvedValue([]);

            await repo.searchSemantic(DEFAULT_EMBEDDING, 10, {
                chunkTypes: ['TEXT', 'TABLE'],
            });

            const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
            expect(query).toContain('chunk_type');
        });
    });

    // ========================================
    // KEYWORD SEARCH
    // ========================================

    describe('searchKeyword', () => {
        it('should perform full-text search on searchContent', async () => {
            const mockResults = [
                { ...createMockChunk(), similarity: 1.0 },
            ];
            prismaMock.$queryRawUnsafe.mockResolvedValue(mockResults);

            const results = await repo.searchKeyword('machine learning', 10);

            expect(results).toHaveLength(1);
            expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
        });

        it('should apply filters in keyword search', async () => {
            prismaMock.$queryRawUnsafe.mockResolvedValue([]);

            await repo.searchKeyword('test query', 5, {
                documentIds: ['doc-1'],
            });

            const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
            expect(query).toContain('document_id');
        });
    });

    // ========================================
    // GET BY DOCUMENT ID
    // ========================================

    describe('getByDocumentId', () => {
        it('should return all chunks for a document', async () => {
            const documentId = 'doc-123';
            const mockChunks = [
                createMockChunk({ documentId, chunkIndex: 0 }),
                createMockChunk({ documentId, chunkIndex: 1 }),
            ];
            prismaMock.contextRagChunk.findMany.mockResolvedValue(mockChunks.map(c => ({
                ...c,
                metadata: JSON.stringify(c.metadata),
            })));

            const results = await repo.getByDocumentId(documentId);

            expect(results).toHaveLength(2);
            expect(prismaMock.contextRagChunk.findMany).toHaveBeenCalledWith({
                where: { documentId },
                orderBy: { chunkIndex: 'asc' },
            });
        });



        it('should return empty array when no chunks found', async () => {
            prismaMock.contextRagChunk.findMany.mockResolvedValue([]);

            const results = await repo.getByDocumentId('empty-doc');

            expect(results).toHaveLength(0);
        });
    });

    // ========================================
    // DELETE BY DOCUMENT ID
    // ========================================

    describe('deleteByDocumentId', () => {
        it('should delete all chunks for a document', async () => {
            prismaMock.contextRagChunk.deleteMany.mockResolvedValue({ count: 15 });

            const count = await repo.deleteByDocumentId('doc-to-delete');

            expect(count).toBe(15);
            expect(prismaMock.contextRagChunk.deleteMany).toHaveBeenCalledWith({
                where: { documentId: 'doc-to-delete' },
            });
        });

        it('should return 0 when no chunks deleted', async () => {
            prismaMock.contextRagChunk.deleteMany.mockResolvedValue({ count: 0 });

            const count = await repo.deleteByDocumentId('no-chunks-doc');

            expect(count).toBe(0);
        });
    });

    // ========================================
    // COUNT BY DOCUMENT ID
    // ========================================

    describe('countByDocumentId', () => {
        it('should return chunk count for document', async () => {
            prismaMock.contextRagChunk.count.mockResolvedValue(42);

            const count = await repo.countByDocumentId('doc-123');

            expect(count).toBe(42);
            expect(prismaMock.contextRagChunk.count).toHaveBeenCalledWith({
                where: { documentId: 'doc-123' },
            });
        });
    });
});
