import type { TokenUsage, VectorChunk, CreateChunkInput, ChunkType } from './chunk.types.js';
import type { DocumentStatus } from './ingestion.types.js';
import type { SearchFilters } from './search.types.js';
import type { PromptConfig, CreatePromptConfig, PromptConfigFilters } from './prompt.types.js';

// ============================================================================
// Document Repository Types
// ============================================================================

/**
 * Input for creating a new document record
 */
export interface CreateDocumentInput {
    filename: string;
    fileHash: string;
    fileSize: number;
    pageCount: number;
    documentType?: string;
    promptConfigId?: string;
    totalBatches: number;
    /** Experiment identifier for A/B testing */
    experimentId?: string;
    /** Model name used for processing */
    modelName?: string;
    /** Model configuration (temperature, maxTokens, etc.) */
    modelConfig?: Record<string, unknown>;
}

/**
 * Input for updating a document record
 */
export interface UpdateDocumentInput {
    status?: string;
    completedBatches?: number;
    failedBatches?: number;
    tokenUsage?: TokenUsage;
    processingMs?: number;
    errorMessage?: string;
    completedAt?: Date;
}

/**
 * Document Repository Interface
 * 
 * Handles CRUD operations for document records.
 */
export interface IDocumentRepository {
    /**
     * Create a new document record
     * @param input - Document creation data
     * @returns Created document ID
     */
    create(input: CreateDocumentInput): Promise<string>;

    /**
     * Get document by ID
     * @param id - Document ID
     * @returns Document status
     * @throws NotFoundError if document not found
     */
    getById(id: string): Promise<DocumentStatus>;

    /**
     * Get document by file hash (returns first match)
     * @param fileHash - SHA-256 hash of file content
     * @returns Document status or null if not found
     */
    getByHash(fileHash: string): Promise<DocumentStatus | null>;

    /**
     * Get document by file hash and experiment ID
     * @param fileHash - SHA-256 hash of file content
     * @param experimentId - Optional experiment identifier
     * @returns Document status or null if not found
     */
    getByHashAndExperiment(fileHash: string, experimentId?: string): Promise<DocumentStatus | null>;

    /**
     * Update document record
     * @param id - Document ID
     * @param input - Update data
     */
    update(id: string, input: UpdateDocumentInput): Promise<void>;

    /**
     * Increment completed batches count
     * @param id - Document ID
     */
    incrementCompleted(id: string): Promise<void>;

    /**
     * Increment failed batches count
     * @param id - Document ID
     */
    incrementFailed(id: string): Promise<void>;

    /**
     * Mark document as completed
     * @param id - Document ID
     * @param tokenUsage - Total token usage
     * @param processingMs - Total processing time
     */
    markCompleted(id: string, tokenUsage: TokenUsage, processingMs: number): Promise<void>;

    /**
     * Mark document as failed
     * @param id - Document ID
     * @param errorMessage - Error description
     */
    markFailed(id: string, errorMessage: string): Promise<void>;

    /**
     * Delete document and related data
     * @param id - Document ID
     */
    delete(id: string): Promise<void>;
}

// ============================================================================
// Batch Repository Types
// ============================================================================

/**
 * Input for creating batch records
 */
export interface CreateBatchInput {
    documentId: string;
    batchIndex: number;
    pageStart: number;
    pageEnd: number;
}

/**
 * Batch record from database
 */
export interface BatchRecord {
    id: string;
    documentId: string;
    batchIndex: number;
    pageStart: number;
    pageEnd: number;
    status: string;
    retryCount: number;
    lastError?: string;
    tokenUsage?: TokenUsage;
    processingMs?: number;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
}

/**
 * Batch Repository Interface
 * 
 * Handles CRUD operations for batch records.
 */
export interface IBatchRepository {
    /**
     * Create multiple batches for a document
     * @param inputs - Array of batch creation data
     */
    createMany(inputs: CreateBatchInput[]): Promise<void>;

    /**
     * Get batch by ID
     * @param id - Batch ID
     * @returns Batch record
     * @throws NotFoundError if batch not found
     */
    getById(id: string): Promise<BatchRecord>;

    /**
     * Get all batches for a document
     * @param documentId - Document ID
     * @returns Array of batch records ordered by batch index
     */
    getByDocumentId(documentId: string): Promise<BatchRecord[]>;

    /**
     * Get pending batches for a document
     * @param documentId - Document ID
     * @returns Array of pending batch records
     */
    getPending(documentId: string): Promise<BatchRecord[]>;

    /**
     * Get failed batches eligible for retry
     * @param documentId - Document ID
     * @param maxRetries - Maximum retry count
     * @returns Array of failed batch records
     */
    getFailed(documentId: string, maxRetries: number): Promise<BatchRecord[]>;

    /**
     * Mark batch as processing
     * @param id - Batch ID
     */
    markProcessing(id: string): Promise<void>;

    /**
     * Mark batch as retrying
     * @param id - Batch ID
     * @param error - Error message
     */
    markRetrying(id: string, error: string): Promise<void>;

    /**
     * Mark batch as completed
     * @param id - Batch ID
     * @param tokenUsage - Token usage for this batch
     * @param processingMs - Processing time in milliseconds
     */
    markCompleted(id: string, tokenUsage: TokenUsage, processingMs: number): Promise<void>;

    /**
     * Mark batch as failed
     * @param id - Batch ID
     * @param error - Error message
     */
    markFailed(id: string, error: string): Promise<void>;

    /**
     * Delete all batches for a document
     * @param documentId - Document ID
     * @returns Number of deleted batches
     */
    deleteByDocument(documentId: string): Promise<number>;
}

// ============================================================================
// Chunk Repository Types
// ============================================================================

/**
 * Chunk search result with similarity score
 */
export interface ChunkSearchResult {
    chunk: VectorChunk;
    similarity: number;
}

/**
 * Chunk Repository Interface
 * 
 * Handles CRUD and search operations for chunk records.
 */
export interface IChunkRepository {
    /**
     * Create a single chunk with embedding
     * @param input - Chunk creation data
     * @param embedding - Vector embedding
     * @returns Created chunk ID
     */
    create(input: CreateChunkInput, embedding: number[]): Promise<string>;

    /**
     * Create multiple chunks with embeddings
     * @param inputs - Array of chunk creation data
     * @param embeddings - Array of vector embeddings
     * @returns Array of created chunk IDs
     */
    createMany(inputs: CreateChunkInput[], embeddings: number[][]): Promise<string[]>;

    /**
     * Vector similarity search
     * @param queryEmbedding - Query vector embedding
     * @param limit - Maximum results to return
     * @param filters - Optional search filters
     * @param minScore - Minimum similarity score
     * @returns Array of chunks with similarity scores
     */
    searchSemantic(
        queryEmbedding: number[],
        limit: number,
        filters?: SearchFilters,
        minScore?: number
    ): Promise<ChunkSearchResult[]>;

    /**
     * Full-text keyword search
     * @param query - Search query string
     * @param limit - Maximum results to return
     * @param filters - Optional search filters
     * @returns Array of chunks with relevance scores
     */
    searchKeyword(
        query: string,
        limit: number,
        filters?: SearchFilters
    ): Promise<ChunkSearchResult[]>;

    /**
     * Get chunks by document ID
     * @param documentId - Document ID
     * @returns Array of chunks
     */
    getByDocumentId(documentId: string): Promise<VectorChunk[]>;

    /**
     * Get chunks by type
     * @param documentId - Document ID
     * @param chunkType - Type of chunks to retrieve
     * @returns Array of matching chunks
     */
    getByType(documentId: string, chunkType: ChunkType): Promise<VectorChunk[]>;

    /**
     * Delete all chunks for a document
     * @param documentId - Document ID
     * @returns Number of deleted chunks
     */
    deleteByDocument(documentId: string): Promise<number>;

    /**
     * Count chunks for a document
     * @param documentId - Document ID
     * @returns Number of chunks
     */
    countByDocument(documentId: string): Promise<number>;
}

// ============================================================================
// PromptConfig Repository Types
// ============================================================================

/**
 * PromptConfig Repository Interface
 * 
 * Handles CRUD operations for prompt configurations.
 */
export interface IPromptConfigRepository {
    /**
     * Create a new prompt configuration
     * @param input - Prompt config creation data
     * @returns Created prompt config
     */
    create(input: CreatePromptConfig): Promise<PromptConfig>;

    /**
     * Get prompt configuration by ID
     * @param id - PromptConfig ID
     * @returns Prompt configuration
     * @throws NotFoundError if not found
     */
    getById(id: string): Promise<PromptConfig>;

    /**
     * Get prompt configurations with filters
     * @param filters - Optional filters
     * @returns Array of matching prompt configs
     */
    getMany(filters?: PromptConfigFilters): Promise<PromptConfig[]>;

    /**
     * Get default prompt config for a document type
     * @param documentType - Document type
     * @returns Default prompt config or null
     */
    getDefault(documentType: string): Promise<PromptConfig | null>;

    /**
     * Get or create default prompt config
     * @param documentType - Document type
     * @returns Existing or newly created prompt config
     */
    getOrCreateDefault(documentType: string): Promise<PromptConfig>;

    /**
     * Update prompt configuration
     * @param id - PromptConfig ID
     * @param input - Update data
     * @returns Updated prompt config
     */
    update(id: string, input: Partial<CreatePromptConfig>): Promise<PromptConfig>;

    /**
     * Set a prompt config as the default for its document type
     * @param id - PromptConfig ID
     */
    setAsDefault(id: string): Promise<void>;

    /**
     * Activate a prompt configuration and set as default
     * @param id - PromptConfig ID
     */
    activate(id: string): Promise<void>;

    /**
     * Deactivate a prompt configuration
     * @param id - PromptConfig ID
     */
    deactivate(id: string): Promise<void>;

    /**
     * Delete prompt configuration
     * @param id - PromptConfig ID
     */
    delete(id: string): Promise<void>;
}
