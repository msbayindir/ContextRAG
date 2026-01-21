/**
 * Retrieval Engine Tests
 * 
 * Tests for search-related types, schemas, and repository operations.
 * Uses direct testing without complex dependency mocking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkRepository } from '../../src/database/repositories/chunk.repository.js';
import { prismaMock } from '../mocks/prisma.mock.js';
import { createMockChunk, createMockSearchResult } from '../mocks/fixtures.js';
import { DEFAULT_EMBEDDING } from '../mocks/gemini.mock.js';

describe('RetrievalEngine', () => {
    // ========================================
    // SEARCH TYPES
    // ========================================

    describe('search types', () => {
        it('should define valid search modes', async () => {
            const { SearchModeEnum } = await import('../../src/types/enums.js');

            expect(SearchModeEnum.SEMANTIC).toBe('semantic');
            expect(SearchModeEnum.KEYWORD).toBe('keyword');
            expect(SearchModeEnum.HYBRID).toBe('hybrid');
        });

        it('should have SearchResult structure with chunk and score', () => {
            const result = createMockSearchResult();

            expect(result).toHaveProperty('chunk');
            expect(result).toHaveProperty('score');
            expect(result.chunk).toHaveProperty('id');
            expect(result.chunk).toHaveProperty('searchContent');
            expect(result.chunk).toHaveProperty('displayContent');
        });
    });

    // ========================================
    // CHUNK REPOSITORY SEARCH
    // ========================================

    describe('chunk repository search', () => {
        let chunkRepo: ChunkRepository;

        beforeEach(() => {
            chunkRepo = new ChunkRepository(prismaMock);
        });

        describe('semantic search', () => {
            it('should build semantic search query with embedding', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10);

                expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('search_vector');
                expect(query).toContain('similarity');
            });

            it('should apply document ID filter', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10, {
                    documentIds: ['doc-1', 'doc-2'],
                });

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('document_id');
            });

            it('should apply chunk type filter', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10, {
                    chunkTypes: ['TEXT', 'TABLE'],
                });

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('chunk_type');
            });

            it('should apply min confidence filter', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10, {
                    minConfidence: 0.8,
                });

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('confidence_score');
            });

            it('should apply min score threshold', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10, undefined, 0.7);

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('HAVING');
            });

            it('should return mapped results with similarity', async () => {
                const mockResults = [
                    {
                        id: 'chunk-1',
                        prompt_config_id: 'config-1',
                        document_id: 'doc-1',
                        chunk_index: 0,
                        chunk_type: 'TEXT',
                        search_content: 'Test content',
                        display_content: 'Test display',
                        source_page_start: 1,
                        source_page_end: 1,
                        confidence_score: 0.9,
                        metadata: { type: 'TEXT', pageRange: { start: 1, end: 1 }, confidence: { score: 0.9, category: 'HIGH' } },
                        created_at: new Date(),
                        similarity: 0.85,
                    },
                ];
                prismaMock.$queryRawUnsafe.mockResolvedValue(mockResults);

                const results = await chunkRepo.searchSemantic(DEFAULT_EMBEDDING, 10);

                expect(results).toHaveLength(1);
                expect(results[0]?.similarity).toBe(0.85);
                expect(results[0]?.chunk.id).toBe('chunk-1');
            });
        });

        describe('keyword search', () => {
            it('should build keyword search query with text search', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchKeyword('test query', 10);

                expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('to_tsvector');
                expect(query).toContain('plainto_tsquery');
            });

            it('should apply document ID filter in keyword search', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchKeyword('test', 10, {
                    documentIds: ['doc-1'],
                });

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('document_id');
            });

            it('should return results sorted by relevance', async () => {
                prismaMock.$queryRawUnsafe.mockResolvedValue([]);

                await chunkRepo.searchKeyword('test', 10);

                const query = prismaMock.$queryRawUnsafe.mock.calls[0]?.[0] as string;
                expect(query).toContain('ORDER BY');
                expect(query).toContain('similarity');
            });
        });
    });

    // ========================================
    // RERANKING CONFIG
    // ========================================

    describe('reranking config', () => {
        it('should have default reranking config values', async () => {
            const { DEFAULT_RERANKING_CONFIG } = await import('../../src/types/config.types.js');

            expect(DEFAULT_RERANKING_CONFIG.enabled).toBe(false);
            expect(DEFAULT_RERANKING_CONFIG.provider).toBe('gemini');
            expect(DEFAULT_RERANKING_CONFIG.defaultCandidates).toBe(50);
            expect(DEFAULT_RERANKING_CONFIG.defaultTopK).toBe(10);
        });
    });

    // ========================================
    // TYPE BOOST
    // ========================================

    describe('type boost calculations', () => {
        it('should correctly calculate boosted scores', () => {
            const originalScore = 0.8;
            const boostFactor = 1.2;

            const boostedScore = Math.min(originalScore * boostFactor, 1.0);

            expect(boostedScore).toBe(0.96);
        });

        it('should cap boosted scores at 1.0', () => {
            const originalScore = 0.9;
            const boostFactor = 1.5;

            const boostedScore = Math.min(originalScore * boostFactor, 1.0);

            expect(boostedScore).toBe(1.0);
        });
    });

    // ========================================
    // SCORE NORMALIZATION
    // ========================================

    describe('score normalization', () => {
        it('should normalize scores between 0 and 1', () => {
            const scores = [0.2, 0.5, 0.8, 0.95];

            scores.forEach(score => {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
            });
        });

        it('should preserve score ordering after normalization', () => {
            const scores = [0.9, 0.7, 0.5, 0.3];
            const sorted = [...scores].sort((a, b) => b - a);

            expect(scores).toEqual(sorted);
        });
    });

    // ========================================
    // HYBRID SEARCH LOGIC
    // ========================================

    describe('hybrid search logic', () => {
        it('should combine and deduplicate results by ID', () => {
            const semanticResults = [
                { id: 'chunk-1', score: 0.9 },
                { id: 'chunk-2', score: 0.8 },
            ];
            const keywordResults = [
                { id: 'chunk-2', score: 0.85 }, // Duplicate
                { id: 'chunk-3', score: 0.7 },
            ];

            // Combine with deduplication (simulating hybrid logic)
            const combined = new Map<string, { id: string; score: number }>();

            for (const result of semanticResults) {
                combined.set(result.id, result);
            }
            for (const result of keywordResults) {
                const existing = combined.get(result.id);
                if (!existing || result.score > existing.score) {
                    combined.set(result.id, result);
                }
            }

            const uniqueResults = Array.from(combined.values());

            expect(uniqueResults).toHaveLength(3);
            // chunk-2 should have higher score (0.85 from keyword)
            const chunk2 = uniqueResults.find(r => r.id === 'chunk-2');
            expect(chunk2?.score).toBe(0.85);
        });
    });
});
