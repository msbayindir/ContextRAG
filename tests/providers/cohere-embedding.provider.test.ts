
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CohereEmbeddingProvider } from '../../src/providers/cohere-embedding.provider';
import { createMockLogger } from '../mocks/logger.mock';
import { RateLimitError, GeminiAPIError, ConfigurationError } from '../../src/errors';

// Mock global fetch
const mockFetch = vi.fn();

describe('CohereEmbeddingProvider', () => {
    let provider: CohereEmbeddingProvider;
    const mockLogger = createMockLogger();

    const config = {
        apiKey: 'test-api-key',
        model: 'embed-multilingual-v3.0',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
        provider = new CohereEmbeddingProvider(config, mockLogger);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should throw if no API key is provided', () => {
        expect(() => {
            new CohereEmbeddingProvider({ apiKey: '' }, mockLogger);
        }).toThrow(ConfigurationError);
    });

    it('should initialize with correct model and dimensions', () => {
        expect(provider.id).toBe('cohere-embed-multilingual-v3.0');
        expect(provider.dimension).toBe(1024);
    });

    describe('embed', () => {
        it('should generate embedding with correct input type', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    embeddings: [[0.1, 0.2, 0.3]],
                    meta: { billed_units: { input_tokens: 10 } },
                }),
            });

            const result = await provider.embed('test text', 'RETRIEVAL_DOCUMENT');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.cohere.ai/v1/embed',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        model: 'embed-multilingual-v3.0',
                        texts: ['test text'],
                        input_type: 'search_document',
                        embedding_types: ['float'],
                    }),
                })
            );
            expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
            expect(result.tokenCount).toBe(10);
        });

        it('should map task types appropriately', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    embeddings: [[0.1]],
                    meta: { billed_units: { input_tokens: 5 } },
                }),
            });

            await provider.embed('query', 'RETRIEVAL_QUERY');
            expect(mockFetch).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"input_type":"search_query"'),
                })
            );

            await provider.embed('clustering', 'CLUSTERING');
            expect(mockFetch).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"input_type":"clustering"'),
                })
            );
        });

        it('should handle API errors', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            });

            await expect(provider.embed('test')).rejects.toThrow(GeminiAPIError);
        });

        it('should handle rate limits', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: async () => 'Too Many Requests',
            });

            await expect(provider.embed('test')).rejects.toThrow(RateLimitError);
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    embeddings: [[0.1], [0.2]],
                    meta: { billed_units: { input_tokens: 20 } },
                }),
            });

            const texts = ['text1', 'text2'];
            const results = await provider.embedBatch(texts, 'RETRIEVAL_DOCUMENT');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining('"texts":["text1","text2"]'),
                })
            );
            expect(results).toHaveLength(2);
            expect(results[0].embedding).toEqual([0.1]);
            expect(results[1].embedding).toEqual([0.2]);
            expect(results[0].tokenCount).toBe(10); // 20 / 2
        });
    });
});
