import type { ResolvedConfig } from '../types/config.types.js';
import type {
    SearchOptions,
    SearchResult,
    SearchResponse,
    SearchFilters,
} from '../types/search.types.js';
import { ChunkRepository } from '../database/repositories/chunk.repository.js';
import { GeminiService } from '../services/gemini.service.js';
import type { Logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { SearchModeEnum } from '../types/enums.js';

/**
 * Retrieval engine for semantic and hybrid search
 */
export class RetrievalEngine {
    private readonly chunkRepo: ChunkRepository;
    private readonly gemini: GeminiService;
    private readonly logger: Logger;

    constructor(
        config: ResolvedConfig,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.chunkRepo = new ChunkRepository(config.prisma);
        this.gemini = new GeminiService(config, rateLimiter, logger);
        this.logger = logger;
    }

    /**
     * Search for relevant content
     */
    async search(options: SearchOptions): Promise<SearchResult[]> {
        const startTime = Date.now();
        const mode = options.mode ?? SearchModeEnum.HYBRID;
        const limit = options.limit ?? 10;

        this.logger.debug('Starting search', {
            query: options.query.substring(0, 50),
            mode,
            limit,
        });

        let results: SearchResult[];

        switch (mode) {
            case SearchModeEnum.SEMANTIC:
                results = await this.semanticSearch(options.query, limit, options.filters, options.minScore);
                break;
            case SearchModeEnum.KEYWORD:
                results = await this.keywordSearch(options.query, limit, options.filters);
                break;
            case SearchModeEnum.HYBRID:
            default:
                results = await this.hybridSearch(options.query, limit, options.filters, options.minScore);
                break;
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
        const { embedding } = await this.gemini.embedQuery(query);

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
}
