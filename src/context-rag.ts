import type {
    ContextRAGConfig,
    ResolvedConfig,
} from './types/config.types.js';
import type {
    DiscoveryResult,
    DiscoveryOptions,
    ApproveStrategyOptions,
} from './types/discovery.types.js';
import type {
    IngestOptions,
    IngestResult,
    DocumentStatus,
} from './types/ingestion.types.js';
import type {
    SearchOptions,
    SearchResult,
    SearchResponse,
} from './types/search.types.js';
import type {
    PromptConfig,
    CreatePromptConfig,
    UpdatePromptConfig,
    PromptConfigFilters,
} from './types/prompt.types.js';

import {
    configSchema,
    DEFAULT_BATCH_CONFIG,
    DEFAULT_CHUNK_CONFIG,
    DEFAULT_RATE_LIMIT_CONFIG,
    DEFAULT_GENERATION_CONFIG,
    DEFAULT_LOG_CONFIG,
    DEFAULT_RERANKING_CONFIG,
} from './types/config.types.js';
import { ConfigurationError, NotFoundError } from './errors/index.js';
import { createLogger, RateLimiter } from './utils/index.js';
import type { Logger } from './utils/logger.js';
import {
    PromptConfigRepository,
    DocumentRepository,
    ChunkRepository,
} from './database/index.js';
import {
    checkDatabaseConnection,
    checkPgVectorExtension,
    getDatabaseStats,
} from './database/utils.js';
import { createEmbeddingProvider } from './providers/embedding-provider.factory.js';
import { IngestionEngine } from './engines/ingestion.engine.js';
import { RetrievalEngine } from './engines/retrieval.engine.js';
import { DiscoveryEngine } from './engines/discovery.engine.js';

/**
 * Main Context-RAG engine class
 *
 * @example
 * ```typescript
 * import { ContextRAG } from 'context-rag';
 * import { PrismaClient } from '@prisma/client';
 *
 * const prisma = new PrismaClient();
 * const rag = new ContextRAG({
 *   prisma,
 *   geminiApiKey: process.env.GEMINI_API_KEY!,
 * });
 *
 * // Ingest a document
 * const result = await rag.ingest({ file: pdfBuffer });
 *
 * // Search
 * const results = await rag.search({ query: 'your query' });
 * ```
 */
export class ContextRAG {
    private readonly config: ResolvedConfig;
    private readonly logger: Logger;
    private readonly rateLimiter: RateLimiter;

    // Engines
    private readonly ingestionEngine: IngestionEngine;
    private readonly retrievalEngine: RetrievalEngine;
    private readonly discoveryEngine: DiscoveryEngine;

    // Repositories
    private readonly promptConfigRepo: PromptConfigRepository;
    private readonly documentRepo: DocumentRepository;
    private readonly chunkRepo: ChunkRepository;

    constructor(userConfig: ContextRAGConfig) {
        // Validate config
        const validation = configSchema.safeParse(userConfig);
        if (!validation.success) {
            throw new ConfigurationError('Invalid configuration', {
                errors: validation.error.errors,
            });
        }

        // Resolve config with defaults
        this.config = this.resolveConfig(userConfig);

        // Initialize logger
        this.logger = createLogger(this.config.logging);

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(this.config.rateLimitConfig);

        // Initialize embedding provider (modular architecture)
        const embeddingProvider = createEmbeddingProvider(this.config, this.rateLimiter, this.logger);

        // Initialize repositories
        this.promptConfigRepo = new PromptConfigRepository(this.config.prisma);
        this.documentRepo = new DocumentRepository(this.config.prisma);
        this.chunkRepo = new ChunkRepository(this.config.prisma);

        // Initialize engines
        this.ingestionEngine = new IngestionEngine(this.config, embeddingProvider, this.rateLimiter, this.logger);
        this.retrievalEngine = new RetrievalEngine(this.config, embeddingProvider, this.rateLimiter, this.logger);
        this.discoveryEngine = new DiscoveryEngine(this.config, this.rateLimiter, this.logger);

        this.logger.info('Context-RAG initialized', {
            model: this.config.model,
            batchConfig: this.config.batchConfig,
        });
    }

    /**
     * Resolve user config with defaults
     */
    private resolveConfig(userConfig: ContextRAGConfig): ResolvedConfig {
        return {
            prisma: userConfig.prisma,
            geminiApiKey: userConfig.geminiApiKey,
            model: userConfig.model ?? 'gemini-1.5-pro',
            embeddingModel: userConfig.embeddingModel ?? 'text-embedding-004',
            generationConfig: {
                ...DEFAULT_GENERATION_CONFIG,
                ...userConfig.generationConfig,
            },
            batchConfig: {
                ...DEFAULT_BATCH_CONFIG,
                ...userConfig.batchConfig,
            },
            chunkConfig: {
                ...DEFAULT_CHUNK_CONFIG,
                ...userConfig.chunkConfig,
            },
            rateLimitConfig: {
                ...DEFAULT_RATE_LIMIT_CONFIG,
                ...userConfig.rateLimitConfig,
            },
            logging: {
                ...DEFAULT_LOG_CONFIG,
                ...userConfig.logging,
                // LOG_LEVEL can be set via userConfig.logging.level
                level: userConfig.logging?.level || DEFAULT_LOG_CONFIG.level,
            },
            ragEnhancement: userConfig.ragEnhancement,
            useStructuredOutput: userConfig.useStructuredOutput ?? true,
            rerankingConfig: {
                ...DEFAULT_RERANKING_CONFIG,
                ...userConfig.rerankingConfig,
            },
            chunkTypeMapping: userConfig.chunkTypeMapping,
        };
    }

    /**
     * Get the resolved configuration
     */
    getConfig(): ResolvedConfig {
        return this.config;
    }

    // ============================================
    // DISCOVERY METHODS
    // ============================================

    /**
     * Analyze a document and get AI-suggested processing strategy
     */
    async discover(options: DiscoveryOptions): Promise<DiscoveryResult> {
        return this.discoveryEngine.discover(options);
    }

    /**
     * Approve a discovery strategy and create a prompt config
     */
    async approveStrategy(
        strategyId: string,
        overrides?: ApproveStrategyOptions
    ): Promise<PromptConfig> {
        const session = this.discoveryEngine.getSession(strategyId);

        if (!session) {
            throw new NotFoundError('Discovery session', strategyId);
        }

        const result = session.result;

        // Build system prompt from specialInstructions or use override/deprecated suggestedPrompt
        const systemPrompt = overrides?.systemPrompt
            ?? result.suggestedPrompt
            ?? result.specialInstructions.join('\n');

        // Create prompt config with optional overrides
        const promptConfig = await this.promptConfigRepo.create({
            documentType: overrides?.documentType ?? result.documentType,
            name: overrides?.name ?? result.documentTypeName,
            systemPrompt,
            chunkStrategy: {
                ...result.suggestedChunkStrategy,
                ...overrides?.chunkStrategy,
            },
            setAsDefault: true,
            changeLog: overrides?.changeLog ?? `Auto-generated from discovery (confidence: ${result.confidence})`,
        });

        // Remove session after successful approval
        this.discoveryEngine.removeSession(strategyId);

        this.logger.info('Strategy approved', {
            strategyId,
            promptConfigId: promptConfig.id,
        });

        return promptConfig;
    }

    // ============================================
    // PROMPT CONFIG METHODS
    // ============================================

    /**
     * Create a custom prompt configuration
     */
    async createPromptConfig(config: CreatePromptConfig): Promise<PromptConfig> {
        return this.promptConfigRepo.create(config);
    }

    /**
     * Get prompt configurations
     */
    async getPromptConfigs(filters?: PromptConfigFilters): Promise<PromptConfig[]> {
        return this.promptConfigRepo.getMany(filters);
    }

    /**
     * Update a prompt configuration (creates new version)
     */
    async updatePromptConfig(
        id: string,
        updates: UpdatePromptConfig
    ): Promise<PromptConfig> {
        const existing = await this.promptConfigRepo.getById(id);

        // Create new version with updates
        return this.promptConfigRepo.create({
            documentType: existing.documentType,
            name: updates.name ?? existing.name,
            systemPrompt: updates.systemPrompt ?? existing.systemPrompt,
            chunkStrategy: {
                ...existing.chunkStrategy,
                ...updates.chunkStrategy,
            },
            setAsDefault: true,
            changeLog: updates.changeLog ?? `Updated from version ${existing.version}`,
        });
    }

    /**
     * Activate a specific prompt config version
     */
    async activatePromptConfig(id: string): Promise<void> {
        return this.promptConfigRepo.activate(id);
    }

    // ============================================
    // INGESTION METHODS
    // ============================================

    /**
     * Ingest a document into the RAG system
     */
    async ingest(options: IngestOptions): Promise<IngestResult> {
        return this.ingestionEngine.ingest(options);
    }

    /**
     * Get the status of a document processing job
     */
    async getDocumentStatus(documentId: string): Promise<DocumentStatus> {
        return this.documentRepo.getById(documentId);
    }


    // ============================================
    // SEARCH METHODS
    // ============================================

    /**
     * Search for relevant content
     */
    async search(options: SearchOptions): Promise<SearchResult[]> {
        return this.retrievalEngine.search(options);
    }

    /**
     * Search with full metadata response
     */
    async searchWithMetadata(options: SearchOptions): Promise<SearchResponse> {
        return this.retrievalEngine.searchWithMetadata(options);
    }

    // ============================================
    // ADMIN METHODS
    // ============================================

    /**
     * Delete a document and all its chunks
     */
    async deleteDocument(documentId: string): Promise<void> {
        this.logger.info('Deleting document', { documentId });

        // Delete chunks first
        await this.chunkRepo.deleteByDocumentId(documentId);

        // Delete document (will cascade delete batches)
        await this.documentRepo.delete(documentId);
    }

    /**
     * Get system statistics
     */
    async getStats(): Promise<{
        totalDocuments: number;
        totalChunks: number;
        promptConfigs: number;
        storageBytes: number;
    }> {
        const stats = await getDatabaseStats(this.config.prisma);
        return {
            totalDocuments: stats.documents,
            totalChunks: stats.chunks,
            promptConfigs: stats.promptConfigs,
            storageBytes: stats.totalStorageBytes,
        };
    }

    /**
     * Health check - verifies system components are operational
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        database: boolean;
        pgvector: boolean;
        reranking: {
            enabled: boolean;
            provider: string;
            configured: boolean;
        };
    }> {
        const database = await checkDatabaseConnection(this.config.prisma);
        let pgvector = false;

        if (database) {
            try {
                pgvector = await checkPgVectorExtension(this.config.prisma);
            } catch {
                pgvector = false;
            }
        }

        // Check reranking configuration
        const rerankingConfig = this.config.rerankingConfig;
        const reranking = {
            enabled: rerankingConfig.enabled,
            provider: rerankingConfig.provider,
            configured: rerankingConfig.provider === 'cohere'
                ? !!rerankingConfig.cohereApiKey
                : true, // Gemini uses existing API key
        };

        let status: 'healthy' | 'degraded' | 'unhealthy';
        if (database && pgvector) {
            status = 'healthy';
        } else if (database) {
            status = 'degraded';
        } else {
            status = 'unhealthy';
        }

        return { status, database, pgvector, reranking };
    }
}
