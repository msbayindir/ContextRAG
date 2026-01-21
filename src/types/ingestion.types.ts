import type { BatchStatusEnumType, DocumentStatusEnumType } from './enums.js';
import type { TokenUsage } from './chunk.types.js';
import type { ProcessingWarning } from '../errors/index.js';

/**
 * Batch status during ingestion
 */
export interface BatchStatus {
    /** Current batch index (1-based) */
    current: number;
    /** Total number of batches */
    total: number;
    /** Batch status */
    status: BatchStatusEnumType;
    /** Page range being processed */
    pageRange: {
        start: number;
        end: number;
    };
    /** Retry count if retrying */
    retryCount?: number;
    /** Error message if failed */
    error?: string;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (status: BatchStatus) => void;

/**
 * Ingestion options
 */
export interface IngestOptions {
    /** PDF file as buffer or file path */
    file: Buffer | string;
    /** Document type (must match a PromptConfig) */
    documentType?: string;
    /** Specific prompt config ID to use */
    promptConfigId?: string;
    /** Custom prompt override (creates temporary config) */
    customPrompt?: string;
    /** Custom filename (if file is buffer) */
    filename?: string;
    /** Experiment identifier for A/B testing different models
     * e.g., "exp_flash_v1", "exp_pro_v2"
     * Allows same PDF to be processed multiple times with different configs
     */
    experimentId?: string;
    /** Progress callback */
    onProgress?: ProgressCallback;
    /** Skip if document already exists (based on hash + experimentId) */
    skipExisting?: boolean;
}

/**
 * Individual batch result
 */
export interface BatchResult {
    batchIndex: number;
    status: BatchStatusEnumType;
    chunksCreated: number;
    tokenUsage: TokenUsage;
    processingMs: number;
    retryCount: number;
    error?: string;
}

/**
 * Ingestion result
 */
export interface IngestResult {
    /** Document ID */
    documentId: string;
    /** Final status */
    status: DocumentStatusEnumType;
    /** Total chunks created */
    chunkCount: number;
    /** Total batches processed */
    batchCount: number;
    /** Failed batch count */
    failedBatchCount: number;
    /** Total token usage */
    tokenUsage: TokenUsage;
    /** Total processing time in milliseconds */
    processingMs: number;
    /** Per-batch results */
    batches: BatchResult[];
    /** Processing warnings (non-fatal issues like fallbacks used) */
    warnings?: ProcessingWarning[];
}

/**
 * Document status query result
 */
export interface DocumentStatus {
    id: string;
    filename: string;
    status: DocumentStatusEnumType;
    documentType?: string;
    pageCount: number;
    progress: {
        totalBatches: number;
        completedBatches: number;
        failedBatches: number;
        percentage: number;
    };
    tokenUsage?: TokenUsage;
    processingMs?: number;
    error?: string;
    createdAt: Date;
    completedAt?: Date;
}

/**
 * Retry options for failed batches
 */
export interface RetryOptions {
    /** Only retry batches that failed with specific errors */
    errorFilter?: string[];
    /** Override max retries for this retry attempt */
    maxRetries?: number;
}
