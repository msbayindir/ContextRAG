import type { ChunkTypeEnumType, ConfidenceLevelEnumType } from './enums.js';

/**
 * Chunk type alias for external use
 */
export type ChunkType = ChunkTypeEnumType;

/**
 * Confidence metadata for chunks
 */
export interface ConfidenceMetadata {
    /** Numeric confidence score (0.0 - 1.0) */
    score: number;
    /** Categorical confidence level */
    category: ConfidenceLevelEnumType;
    /** Individual factors contributing to confidence */
    factors?: {
        textClarity?: number;
        structureRecognition?: number;
        tableAccuracy?: number;
    };
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
    input: number;
    output: number;
    total: number;
}

/**
 * Chunk metadata stored in JSON column
 */
export interface ChunkMetadata {
    /** Source page number (single page) */
    page?: number;
    /** Source page range */
    pageRange?: {
        start: number;
        end: number;
    };
    /** Chunk type */
    type: ChunkType;
    /** Confidence information */
    confidence: ConfidenceMetadata;
    /** Token usage for this chunk */
    tokens?: TokenUsage;
    /** Processing duration in milliseconds */
    processingDurationMs?: number;
    /** Section or heading this chunk belongs to */
    section?: string;
    /** Keywords extracted from content */
    keywords?: string[];
    /** Custom metadata added by user */
    custom?: Record<string, unknown>;
}

/**
 * Chunking strategy configuration
 */
export interface ChunkStrategy {
    /** Maximum tokens per chunk */
    maxTokens: number;
    /** Overlap tokens between chunks */
    overlapTokens: number;
    /** How to split the document */
    splitBy: 'page' | 'section' | 'paragraph' | 'semantic';
    /** Preserve table integrity (don't split tables) */
    preserveTables?: boolean;
    /** Preserve list integrity */
    preserveLists?: boolean;
    /** Extract headings as separate chunks */
    extractHeadings?: boolean;
}

/**
 * Vector chunk data structure
 */
export interface VectorChunk {
    id: string;
    promptConfigId: string;
    documentId: string;
    chunkIndex: number;
    chunkType: ChunkType;

    /** Content optimized for vector search */
    searchContent: string;
    /** Rich Markdown content for display */
    displayContent: string;

    sourcePageStart: number;
    sourcePageEnd: number;
    confidenceScore: number;
    metadata: ChunkMetadata;

    createdAt: Date;
}

/**
 * Chunk creation input
 */
export interface CreateChunkInput {
    promptConfigId: string;
    documentId: string;
    chunkIndex: number;
    chunkType: ChunkType;
    searchContent: string;
    displayContent: string;
    sourcePageStart: number;
    sourcePageEnd: number;
    confidenceScore: number;
    metadata: ChunkMetadata;
}
