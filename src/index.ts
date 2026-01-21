/**
 * Context-RAG: A powerful, multimodal RAG engine
 *
 * @packageDocumentation
 */

// Main class
export { ContextRAG } from './context-rag.js';

export type {
    ContextRAGConfig,
    ContextRAGOptions,
    // Config subtypes
    BatchConfig,
    ChunkConfig,
    RateLimitConfig,
    RerankingConfig,
    GenerationConfig,
    LogConfig,
    ResolvedConfig,
} from './types/config.types.js';

// RAG Enhancement types
export type {
    RagEnhancementConfig,
    AnthropicContextualConfig,
    CustomEnhancementConfig,
    NoEnhancementConfig,
    RagApproach,
    AnthropicStrategy,
    ChunkData,
    DocumentContext,
    EnhancementHandler,
} from './types/rag-enhancement.types.js';

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
    SearchResponse,
    SearchMetadata,
} from './types/search.types.js';

export type {
    DiscoveryResult,
    DiscoveryOptions,
    ApproveStrategyOptions,
} from './types/discovery.types.js';

export type {
    IngestOptions,
    IngestResult,
    BatchStatus,
    DocumentStatus,
    BatchResult,
    ProgressCallback,
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

