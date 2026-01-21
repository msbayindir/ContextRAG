
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../src/providers/openai-embedding.provider';
import { createMockLogger } from '../mocks/logger.mock';
import { RateLimitError, GeminiAPIError } from '../../src/errors';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            embeddings: {
                create: mockCreate,
            },
        })),
    };
});

describe('OpenAIEmbeddingProvider', () => {
    let provider: OpenAIEmbeddingProvider;
    const mockLogger = createMockLogger();
    // Create a simple mock rate limiter
    const mockRateLimiter = {
        acquire: vi.fn().mockResolvedValue(undefined),
        reportSuccess: vi.fn(),
        reportRateLimitError: vi.fn(),
    } as any;

    const config = {
        apiKey: 'test-api-key',
        model: 'text-embedding-3-small',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new OpenAIEmbeddingProvider(config, mockRateLimiter, mockLogger);
    });

    it('should initialize with correct model and dimensions', () => {
        expect(provider.id).toBe('openai-text-embedding-3-small');
        expect(provider.dimension).toBe(1536);
    });

    it('should initialize with custom dimensions', () => {
        const customProvider = new OpenAIEmbeddingProvider(
            { ...config, dimensions: 512 },
            mockRateLimiter,
            mockLogger
        );
        expect(customProvider.dimension).toBe(512);
    });

    describe('embed', () => {
        it('should generate embedding with correct prefix for documents', async () => {
            mockCreate.mockResolvedValueOnce({
                data: [{ embedding: [0.1, 0.2, 0.3] }],
                usage: { total_tokens: 10 },
            });

            const result = await provider.embed('test text', 'RETRIEVAL_DOCUMENT');

            expect(mockCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: 'passage: test text',
            });
            expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
            expect(result.tokenCount).toBe(10);
        });

        it('should generate embedding with correct prefix for queries', async () => {
            mockCreate.mockResolvedValueOnce({
                data: [{ embedding: [0.1, 0.2, 0.3] }],
                usage: { total_tokens: 10 },
            });

            await provider.embed('test query', 'RETRIEVAL_QUERY');

            expect(mockCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: 'query: test query',
            });
        });

        it('should handle rate limits', async () => {
            const error = new Error('429 Too Many Requests');
            mockCreate.mockRejectedValueOnce(error);

            await expect(provider.embed('test')).rejects.toThrow(RateLimitError);
            expect(mockRateLimiter.reportRateLimitError).toHaveBeenCalled();
        });

        it('should handle API errors', async () => {
            const error = new Error('invalid_api_key');
            mockCreate.mockRejectedValueOnce(error);

            await expect(provider.embed('test')).rejects.toThrow(GeminiAPIError);
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            mockCreate.mockResolvedValueOnce({
                data: [
                    { embedding: [0.1, 0.1] },
                    { embedding: [0.2, 0.2] },
                ],
                usage: { total_tokens: 20 },
            });

            const texts = ['text1', 'text2'];
            const results = await provider.embedBatch(texts, 'RETRIEVAL_DOCUMENT');

            expect(mockCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: ['passage: text1', 'passage: text2'],
            });
            expect(results).toHaveLength(2);
            expect(results[0].embedding).toEqual([0.1, 0.1]);
            expect(results[1].embedding).toEqual([0.2, 0.2]);
            // Token count should be distributed
            expect(results[0].tokenCount).toBe(10);
        });
    });
});
