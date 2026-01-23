import type { ResolvedConfig } from '../types/config.types.js';
import type {
    SearchOptions,
    SearchResult,
    SearchResponse,
    SearchFilters,
} from '../types/search.types.js';
import type { RerankingConfig } from '../types/config.types.js';
import { ChunkRepository } from '../database/repositories/chunk.repository.js';
import { GeminiService } from '../services/gemini.service.js';
import type { EmbeddingProvider } from '../types/embedding-provider.types.js';
import { createReranker, type RerankerService } from '../services/reranker.service.js';
import type { Logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { SearchModeEnum } from '../types/enums.js';

/**
 * Retrieval engine for semantic and hybrid search
 */
export class RetrievalEngine {
    private readonly chunkRepo: ChunkRepository;
    private readonly gemini: GeminiService;
    private readonly embeddingProvider: EmbeddingProvider;
    private readonly logger: Logger;
    private readonly reranker: RerankerService;
    private readonly rerankingConfig: RerankingConfig;

    constructor(
        config: ResolvedConfig,
        embeddingProvider: EmbeddingProvider,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.chunkRepo = new ChunkRepository(config.prisma);
        this.gemini = new GeminiService(config, rateLimiter, logger);
        this.embeddingProvider = embeddingProvider;
        this.logger = logger;
        this.rerankingConfig = config.rerankingConfig;
        this.reranker = createReranker(config, this.gemini, logger);
    }

    /**
     * Search for relevant content
     * Note: HEADING chunks are excluded by default. Use filters.chunkTypes to include them.
     */
    async search(options: SearchOptions): Promise<SearchResult[]> {
        const startTime = Date.now();
        const mode = options.mode ?? SearchModeEnum.HYBRID;
        const limit = options.limit ?? 10;

        // Apply default filter to exclude HEADING chunks unless explicitly included
        const filters: SearchFilters = {
            ...options.filters,
        };

        // If chunkTypes not specified, exclude HEADING by default
        if (!filters.chunkTypes) {
            filters.chunkTypes = ['TEXT', 'TABLE', 'LIST', 'CODE', 'QUOTE', 'IMAGE_REF', 'QUESTION', 'MIXED'];
        }

        this.logger.debug('Starting search', {
            query: options.query.substring(0, 50),
            mode,
            limit,
        });

        let results: SearchResult[];

        switch (mode) {
            case SearchModeEnum.SEMANTIC:
                results = await this.semanticSearch(options.query, limit, filters, options.minScore);
                break;
            case SearchModeEnum.KEYWORD:
                results = await this.keywordSearch(options.query, limit, filters);
                break;
            case SearchModeEnum.HYBRID:
            default:
                results = await this.hybridSearch(options.query, limit, filters, options.minScore);
                break;
        }

        // Apply reranking if enabled
        const shouldRerank = options.useReranking ?? this.rerankingConfig.enabled;
        if (shouldRerank && results.length > 1) {
            const candidates = options.rerankCandidates ?? this.rerankingConfig.defaultCandidates;
            // Get more candidates for reranking if needed
            if (results.length < candidates) {
                // Re-fetch with more results for reranking
                switch (mode) {
                    case SearchModeEnum.SEMANTIC:
                        results = await this.semanticSearch(options.query, candidates, filters, options.minScore);
                        break;
                    case SearchModeEnum.KEYWORD:
                        results = await this.keywordSearch(options.query, candidates, filters);
                        break;
                    case SearchModeEnum.HYBRID:
                    default:
                        results = await this.hybridSearch(options.query, candidates, filters, options.minScore);
                        break;
                }
            }
            results = await this.applyReranking(options.query, results, limit);
        }

        // Apply type boosting if specified
        if (options.typeBoost) {
            results = this.applyTypeBoost(results, options.typeBoost);
        }

        // Add explanations if requested
        if (options.includeExplanation) {
            results = results.map(r => ({
                ...r,
                explanation: {
                    matchType: mode === SearchModeEnum.HYBRID ? 'both' : mode === SearchModeEnum.SEMANTIC ? 'semantic' : 'keyword',
                    rawScores: {
                        semantic: r.score,
                    },
                },
            }));
        }

        this.logger.debug('Search completed', {
            resultCount: results.length,
            processingTimeMs: Date.now() - startTime,
        });

        return results;
    }

    /**
     * Search with full metadata response
     */
    async searchWithMetadata(options: SearchOptions): Promise<SearchResponse> {
        const startTime = Date.now();
        const results = await this.search(options);

        return {
            results,
            metadata: {
                totalFound: results.length,
                processingTimeMs: Date.now() - startTime,
                searchMode: options.mode ?? SearchModeEnum.HYBRID,
            },
        };
    }

    /**
     * Semantic search using vector similarity
     */
    private async semanticSearch(
        query: string,
        limit: number,
        filters?: SearchFilters,
        minScore?: number
    ): Promise<SearchResult[]> {
        // Generate query embedding with RETRIEVAL_QUERY task type
        const { embedding } = await this.embeddingProvider.embedQuery(query);

        // Search in vector database
        const results = await this.chunkRepo.searchSemantic(
            embedding,
            limit,
            filters,
            minScore
        );

        return results.map(r => ({
            chunk: r.chunk,
            score: r.similarity,
        }));
    }

    /**
     * Keyword-based search using full-text search
     */
    private async keywordSearch(
        query: string,
        limit: number,
        filters?: SearchFilters
    ): Promise<SearchResult[]> {
        const results = await this.chunkRepo.searchKeyword(query, limit, filters);

        return results.map(r => ({
            chunk: r.chunk,
            score: r.similarity,
        }));
    }

    /**
     * Hybrid search combining semantic and keyword
     */
    private async hybridSearch(
        query: string,
        limit: number,
        filters?: SearchFilters,
        minScore?: number
    ): Promise<SearchResult[]> {
        // Run both searches in parallel
        const [semanticResults, keywordResults] = await Promise.all([
            this.semanticSearch(query, limit * 2, filters, minScore),
            this.keywordSearch(query, limit * 2, filters),
        ]);

        // Combine and deduplicate results
        const combinedMap = new Map<string, SearchResult>();

        // Add semantic results with weight 0.7
        for (const result of semanticResults) {
            combinedMap.set(result.chunk.id, {
                ...result,
                score: result.score * 0.7,
            });
        }

        // Add keyword results with weight 0.3, combining scores if already exists
        for (const result of keywordResults) {
            const existing = combinedMap.get(result.chunk.id);
            if (existing) {
                existing.score += result.score * 0.3;
            } else {
                combinedMap.set(result.chunk.id, {
                    ...result,
                    score: result.score * 0.3,
                });
            }
        }

        // Sort by combined score and limit
        const combined = Array.from(combinedMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return combined;
    }

    /**
     * Apply type-based boosting to results
     */
    private applyTypeBoost(
        results: SearchResult[],
        typeBoost: Partial<Record<string, number>>
    ): SearchResult[] {
        return results
            .map(result => {
                const boost = typeBoost[result.chunk.chunkType] ?? 1;
                return {
                    ...result,
                    score: result.score * boost,
                    explanation: result.explanation
                        ? {
                            ...result.explanation,
                            intentBoost: boost !== 1,
                            boostReason: boost !== 1 ? `Type boost for ${result.chunk.chunkType}: ${boost}x` : undefined,
                        }
                        : undefined,
                };
            })
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Apply reranking to search results using configured reranker
     * Gracefully degrades to original order if reranking fails
     */
    private async applyReranking(
        query: string,
        results: SearchResult[],
        topK: number
    ): Promise<SearchResult[]> {
        this.logger.debug('Applying reranking', {
            candidateCount: results.length,
            topK,
        });

        try {
            const rerankDocs = results.map((r, i) => ({
                id: r.chunk.id,
                content: r.chunk.displayContent,
                originalRank: i,
                originalScore: r.score,
            }));

            const reranked = await this.reranker.rerank(query, rerankDocs, topK);

            return reranked.map(r => {
                const original = results.find(res => res.chunk.id === r.id)!;
                return {
                    chunk: original.chunk,
                    score: r.relevanceScore,
                    explanation: {
                        matchType: original.explanation?.matchType ?? 'both',
                        matchedTerms: original.explanation?.matchedTerms,
                        intentBoost: original.explanation?.intentBoost,
                        boostReason: original.explanation?.boostReason,
                        rawScores: original.explanation?.rawScores,
                        reranked: true,
                        originalRank: r.originalRank,
                    },
                };
            });
        } catch (error) {
            // Graceful degradation: return original results if reranking fails
            this.logger.warn('Reranking failed, falling back to original order', {
                error: (error as Error).message,
                candidateCount: results.length,
            });

            // Return top K results in original order with degradation marker
            return results.slice(0, topK).map((r, index) => ({
                chunk: r.chunk,
                score: r.score,
                explanation: {
                    matchType: r.explanation?.matchType ?? 'both',
                    matchedTerms: r.explanation?.matchedTerms,
                    intentBoost: r.explanation?.intentBoost,
                    boostReason: r.explanation?.boostReason,
                    rawScores: r.explanation?.rawScores,
                    reranked: false,
                    originalRank: index,
                },
            }));
        }
    }
}
