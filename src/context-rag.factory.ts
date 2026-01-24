
import { ContextRAG } from './context-rag.js';
import type { ContextRAGConfig, ResolvedConfig, LLMProviderConfig } from './types/config.types.js';
import {
    DEFAULT_BATCH_CONFIG,
    DEFAULT_CHUNK_CONFIG,
    DEFAULT_RATE_LIMIT_CONFIG,
    DEFAULT_GENERATION_CONFIG,
    DEFAULT_LOG_CONFIG,
    DEFAULT_RERANKING_CONFIG,
    DEFAULT_LLM_PROVIDER,
} from './types/config.types.js';
import { createLogger } from './utils/index.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { createEmbeddingProvider } from './providers/embedding-provider.factory.js';
import {
    DocumentRepository,
    BatchRepository,
    ChunkRepository,
    PromptConfigRepository,
} from './database/index.js';
import { IngestionEngine, type IngestionEngineDependencies } from './engines/ingestion.engine.js';
import { RetrievalEngine, type RetrievalEngineDependencies } from './engines/retrieval.engine.js';
import { DiscoveryEngine } from './engines/discovery.engine.js';
import { PDFProcessor } from './services/pdf.processor.js';
import { createReranker } from './services/reranker.service.js';
import type { ILLMService, ILLMServiceFactory } from './types/llm-service.types.js';
import type { IPDFProcessor } from './types/pdf-processor.types.js';
import { createLLMService, createLLMServiceFactory } from './services/llm/llm.factory.js';

/**
 * Factory for creating ContextRAG instances with proper dependency injection
 * 
 * This is the recommended way to create ContextRAG instances in v2.0+.
 * All dependencies are wired here and injected into engines.
 * 
 * @example
 * ```typescript
 * import { createContextRAG } from 'context-rag';
 * 
 * const rag = createContextRAG({
 *   prisma: prismaClient,
 *   geminiApiKey: process.env.GEMINI_API_KEY!,
 * });
 * 
 * await rag.ingest({ file: pdfBuffer });
 * const results = await rag.search({ query: 'test' });
 * ```
 */
export class ContextRAGFactory {
    /**
     * Create a new ContextRAG instance with all dependencies wired
     * @param userConfig - User configuration
     * @returns Fully configured ContextRAG instance
     */
    static create(userConfig: ContextRAGConfig): ContextRAG {
        const config = ContextRAGFactory.resolveConfig(userConfig);
        const logger = createLogger(config.logging);
        const rateLimiter = new RateLimiter(config.rateLimitConfig);

        // Core Services (implementing interfaces)
        const llmService: ILLMService = createLLMService(config, logger);
        const embeddingProvider = createEmbeddingProvider(config, rateLimiter, logger);
        const pdfProcessor: IPDFProcessor = new PDFProcessor(logger);
        const reranker = createReranker(config, llmService, logger);
        const llmFactory: ILLMServiceFactory = createLLMServiceFactory();

        // Repositories (implementing interfaces)
        const repositories = {
            promptConfig: new PromptConfigRepository(config.prisma),
            document: new DocumentRepository(config.prisma),
            chunk: new ChunkRepository(config.prisma),
            batch: new BatchRepository(config.prisma),
        };

        // Build dependencies for engines
        const ingestionDeps: IngestionEngineDependencies = {
            llm: llmService,
            llmFactory,
            pdfProcessor,
            embeddingProvider,
            repositories,
        };

        const retrievalDeps: RetrievalEngineDependencies = {
            llm: llmService,
            embeddingProvider,
            chunkRepo: repositories.chunk,
            reranker,
        };

        // Create Engines with injected dependencies
        const ingestionEngine = new IngestionEngine(config, ingestionDeps, logger);
        const retrievalEngine = new RetrievalEngine(config, retrievalDeps, logger);
        const discoveryEngine = new DiscoveryEngine(config, llmService, pdfProcessor, logger);

        // Create and return ContextRAG facade
        return new ContextRAG(
            userConfig,
            {
                ingestionEngine,
                retrievalEngine,
                discoveryEngine,
                repos: repositories
            }
        );
    }

    /**
     * Resolve user config with defaults
     */
    private static resolveConfig(userConfig: ContextRAGConfig): ResolvedConfig {
        const resolveProvider = (provider?: LLMProviderConfig): LLMProviderConfig => {
            const resolved: LLMProviderConfig = {
                ...DEFAULT_LLM_PROVIDER,
                ...provider,
            };

            if (resolved.provider === 'gemini') {
                return {
                    ...resolved,
                    apiKey: resolved.apiKey ?? userConfig.geminiApiKey,
                    model: resolved.model ?? (userConfig.model ?? 'gemini-2.5-flash'),
                };
            }

            return resolved;
        };

        const llmProvider = resolveProvider(userConfig.llmProvider);
        const documentProvider = resolveProvider(userConfig.documentProvider ?? userConfig.llmProvider);

        return {
            prisma: userConfig.prisma,
            geminiApiKey: userConfig.geminiApiKey,
            model: userConfig.model ?? 'gemini-2.5-flash',
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
                level: userConfig.logging?.level || DEFAULT_LOG_CONFIG.level,
            },
            ragEnhancement: userConfig.ragEnhancement,
            useStructuredOutput: userConfig.useStructuredOutput ?? true,
            rerankingConfig: {
                ...DEFAULT_RERANKING_CONFIG,
                ...userConfig.rerankingConfig,
            },
            chunkTypeMapping: userConfig.chunkTypeMapping,
            llmProvider,
            documentProvider,
        };
    }
}

/**
 * Create a new ContextRAG instance
 * 
 * This is the primary entry point for v2.0+.
 * Uses factory pattern for proper dependency injection.
 * 
 * @param config - Configuration options
 * @returns Configured ContextRAG instance
 * 
 * @example
 * ```typescript
 * const rag = createContextRAG({
 *   prisma: prismaClient,
 *   geminiApiKey: process.env.GEMINI_API_KEY!,
 *   model: 'gemini-1.5-pro',
 * });
 * ```
 */
export function createContextRAG(config: ContextRAGConfig): ContextRAG {
    return ContextRAGFactory.create(config);
}
