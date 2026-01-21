/**
 * Context-RAG: A powerful, multimodal RAG engine
 *
 * @packageDocumentation
 */

// Main class
export { ContextRAG } from './context-rag.js';

// Types
export type {
    ContextRAGConfig,
    ContextRAGOptions,
} from './types/config.types.js';

export type {
    ChunkType,
    ChunkMetadata,
    VectorChunk,
    ChunkStrategy,
} from './types/chunk.types.js';

export type {
    SearchOptions,
    SearchResult,
    SearchMode,
    SearchFilters,
} from './types/search.types.js';

export type {
    DiscoveryResult,
    DiscoveryOptions,
} from './types/discovery.types.js';

export type {
    IngestOptions,
    IngestResult,
    BatchStatus,
    DocumentStatus,
} from './types/ingestion.types.js';

export type {
    PromptConfig,
    CreatePromptConfig,
} from './types/prompt.types.js';

// Enums
export { ChunkTypeEnum, BatchStatusEnum, DocumentStatusEnum } from './types/enums.js';

// Errors
export {
    ContextRAGError,
    ConfigurationError,
    IngestionError,
    SearchError,
    DiscoveryError,
    RerankingError,
    DatabaseError,
    RateLimitError,
    NotFoundError,
    GeminiAPIError,
    PDFProcessingError,
    ContentPolicyError,
    ValidationError,
    // Utilities
    generateCorrelationId,
    setCorrelationId,
    getCorrelationId,
    clearCorrelationId,
    wrapError,
} from './errors/index.js';

export type { ProcessingWarning, ErrorContext } from './errors/index.js';

