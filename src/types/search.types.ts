import type { ChunkType, VectorChunk } from './chunk.types.js';
import type { SearchModeEnumType } from './enums.js';

/**
 * Search mode type alias
 */
export type SearchMode = SearchModeEnumType;

/**
 * Search filters
 */
export interface SearchFilters {
    /** Filter by document types */
    documentTypes?: string[];
    /** Filter by chunk types (TEXT, TABLE, CODE, etc.) */
    chunkTypes?: ChunkType[];
    /** Filter by custom sub-types (CLAUSE, MEDICATION, QUESTION, etc.) */
    subTypes?: string[];
    /** Filter by domain (legal, medical, educational, etc.) */
    domains?: string[];
    /** Minimum confidence score (0.0 - 1.0) */
    minConfidence?: number;
    /** Filter by specific document IDs */
    documentIds?: string[];
    /** Filter by page range */
    pageRange?: {
        start: number;
        end: number;
    };
    /** Filter by prompt config IDs */
    promptConfigIds?: string[];
}

/**
 * Search options
 */
export interface SearchOptions {
    /** The search query */
    query: string;
    /** Search mode: semantic, keyword, or hybrid (default: hybrid) */
    mode?: SearchMode;
    /** Maximum number of results (default: 10) */
    limit?: number;
    /** Minimum similarity score threshold (0.0 - 1.0) */
    minScore?: number;
    /** Search filters */
    filters?: SearchFilters;
    /** Include explanation of why results matched */
    includeExplanation?: boolean;
    /** Boost results containing specific chunk types */
    typeBoost?: Partial<Record<ChunkType, number>>;
    /** Enable reranking for better relevance (default: false) */
    useReranking?: boolean;
    /** Number of candidates to retrieve before reranking (default: limit * 5) */
    rerankCandidates?: number;
}

/**
 * Search result explanation
 */
export interface SearchExplanation {
    /** How the result matched */
    matchType: 'semantic' | 'keyword' | 'both';
    /** Terms that matched (for keyword search) */
    matchedTerms?: string[];
    /** Whether intent boosting was applied */
    intentBoost?: boolean;
    /** Boost reason if applied */
    boostReason?: string;
    /** Raw scores before normalization */
    rawScores?: {
        semantic?: number;
        keyword?: number;
    };
    /** True if result was reranked */
    reranked?: boolean;
    /** Original rank before reranking */
    originalRank?: number;
}

/**
 * Individual search result
 */
export interface SearchResult {
    /** The matched chunk */
    chunk: VectorChunk;
    /** Relevance score (0.0 - 1.0) */
    score: number;
    /** Explanation of match (if requested) */
    explanation?: SearchExplanation;
}

/**
 * Search response metadata
 */
export interface SearchMetadata {
    /** Total results found (before limit) */
    totalFound: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
    /** Search mode used */
    searchMode: SearchMode;
    /** Query embedding token usage */
    embeddingTokens?: number;
}

/**
 * Full search response
 */
export interface SearchResponse {
    results: SearchResult[];
    metadata: SearchMetadata;
}
