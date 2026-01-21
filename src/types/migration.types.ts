/**
 * Migration Types
 * 
 * Types for embedding migration and re-indexing operations
 */

import type { EmbeddingProviderType } from './embedding-provider.types.js';

/**
 * Result of checking for embedding model mismatch
 */
export interface MismatchResult {
    /** Whether there is a mismatch */
    hasMismatch: boolean;
    /** Current configured embedding model */
    currentModel: string;
    /** Current configured provider */
    currentProvider: EmbeddingProviderType;
    /** Current configured dimension */
    currentDimension: number;
    /** Models found in existing chunks */
    existingModels: EmbeddingModelStats[];
    /** Total chunks that need re-indexing */
    chunksToMigrate: number;
    /** Total chunks in database */
    totalChunks: number;
}

/**
 * Statistics for an embedding model in the database
 */
export interface EmbeddingModelStats {
    /** Model identifier (null for legacy chunks without tracking) */
    model: string | null;
    /** Number of chunks using this model */
    count: number;
    /** Dimension of the embeddings */
    dimension: number | null;
}

/**
 * Options for re-indexing operation
 */
export interface ReindexOptions {
    /** Maximum concurrent embedding calls (default: 5) */
    concurrency?: number;
    /** Batch size for processing (default: 50) */
    batchSize?: number;
    /** Document IDs to re-index (if empty, all documents) */
    documentIds?: string[];
    /** Progress callback */
    onProgress?: (progress: ReindexProgress) => void;
    /** Whether to skip chunks that already match current model */
    skipMatching?: boolean;
}

/**
 * Progress information during re-indexing
 */
export interface ReindexProgress {
    /** Total chunks to process */
    total: number;
    /** Chunks processed so far */
    processed: number;
    /** Chunks successfully updated */
    succeeded: number;
    /** Chunks that failed */
    failed: number;
    /** Current phase */
    phase: 'fetching' | 'embedding' | 'updating' | 'complete';
    /** Estimated time remaining in seconds */
    estimatedSecondsRemaining?: number;
}

/**
 * Result of re-indexing operation
 */
export interface ReindexResult {
    /** Whether the operation was successful */
    success: boolean;
    /** Total chunks processed */
    totalProcessed: number;
    /** Chunks successfully updated */
    succeeded: number;
    /** Chunks that failed */
    failed: number;
    /** Failed chunk IDs with error messages */
    failures: Array<{ chunkId: string; error: string }>;
    /** Total duration in milliseconds */
    durationMs: number;
    /** New embedding model applied */
    newModel: string;
}

/**
 * Mismatch warning level
 */
export type MismatchSeverity = 'none' | 'warning' | 'critical';

/**
 * Mismatch detection info for user notification
 */
export interface MismatchInfo {
    severity: MismatchSeverity;
    message: string;
    details: MismatchResult;
    /** Suggested action */
    action: 'none' | 'reindex' | 'reindex-required';
}
