
import type { ResolvedConfig } from '../types/config.types.js';
import type {
    IngestOptions,
    IngestResult,
    BatchStatus,
    BatchResult,
} from '../types/ingestion.types.js';
import type { ProcessingWarning } from '../errors/index.js';
import type { TokenUsage } from '../types/chunk.types.js';
import type { ILLMService } from '../types/llm-service.types.js';
import type { IPDFProcessor } from '../types/pdf-processor.types.js';
import type { 
    IDocumentRepository, 
    IBatchRepository, 
    IChunkRepository, 
    IPromptConfigRepository 
} from '../types/repository.types.js';
import { BatchStatusEnum, DocumentStatusEnum } from '../types/enums.js';
import type { EmbeddingProvider } from '../types/embedding-provider.types.js';
import type { Logger } from '../utils/logger.js';
import {
    DEFAULT_DOCUMENT_INSTRUCTIONS
} from '../config/templates.js';
import { createEnhancementHandler } from '../enhancements/enhancement-registry.js';
import type { EnhancementHandler } from '../types/rag-enhancement.types.js';
import { BatchProcessor } from './ingestion/batch.processor.js';
import { GeminiService } from '../services/gemini.service.js';

/**
 * Dependencies required for IngestionEngine
 * 
 * This interface follows the Interface Segregation Principle (ISP),
 * bundling only the dependencies needed for document ingestion.
 * 
 * @example
 * ```typescript
 * const deps: IngestionEngineDependencies = {
 *   llm: geminiService,
 *   pdfProcessor: pdfProcessor,
 *   embeddingProvider: embeddingProvider,
 *   repositories: {
 *     document: documentRepo,
 *     batch: batchRepo,
 *     chunk: chunkRepo,
 *     promptConfig: promptConfigRepo,
 *   },
 * };
 * ```
 */
export interface IngestionEngineDependencies {
    /** LLM service for AI operations (content extraction, chunk generation) */
    llm: ILLMService;
    /** PDF processor service for loading and batching PDF files */
    pdfProcessor: IPDFProcessor;
    /** Embedding provider for generating vector embeddings */
    embeddingProvider: EmbeddingProvider;
    /** Repository instances for database operations */
    repositories: {
        document: IDocumentRepository;
        batch: IBatchRepository;
        chunk: IChunkRepository;
        promptConfig: IPromptConfigRepository;
    };
}

/**
 * Ingestion engine for processing documents into searchable chunks
 * 
 * **Responsibilities:**
 * - PDF loading and batch creation
 * - Content extraction using LLM vision capabilities
 * - Chunk parsing and validation
 * - Vector embedding generation
 * - Database persistence
 * - Enhancement processing (e.g., contextual retrieval)
 * 
 * **Architecture:**
 * Uses structured template system with `<!-- SECTION -->` markers
 * for consistent, reliable output parsing. Batch processing enables
 * handling of large documents with controlled concurrency.
 * 
 * **Error Handling:**
 * - Retries failed batches with exponential backoff
 * - Records processing warnings for non-fatal issues
 * - Provides detailed result with per-batch status
 * 
 * @example
 * ```typescript
 * const engine = new IngestionEngine(config, dependencies, logger);
 * 
 * // Basic ingestion
 * const result = await engine.ingest({ 
 *   file: pdfBuffer, 
 *   filename: 'document.pdf' 
 * });
 * 
 * // With custom prompt
 * const result = await engine.ingest({ 
 *   file: pdfBuffer,
 *   promptConfigId: 'custom-prompt-id'
 * });
 * 
 * console.log(`Created ${result.chunkCount} chunks`);
 * ```
 */
export class IngestionEngine {
    private readonly config: ResolvedConfig;
    private readonly llm: ILLMService;
    private readonly pdfProcessor: IPDFProcessor;
    private readonly documentRepo: IDocumentRepository;
    private readonly batchRepo: IBatchRepository;
    private readonly chunkRepo: IChunkRepository;
    private readonly promptConfigRepo: IPromptConfigRepository;
    private readonly logger: Logger;
    private readonly enhancementHandler: EnhancementHandler;
    private readonly batchProcessor: BatchProcessor;

    /**
     * Create a new IngestionEngine
     * @param config - Resolved configuration
     * @param dependencies - All required dependencies
     * @param logger - Logger instance
     */
    constructor(
        config: ResolvedConfig,
        dependencies: IngestionEngineDependencies,
        logger: Logger
    ) {
        this.config = config;
        this.llm = dependencies.llm;
        this.pdfProcessor = dependencies.pdfProcessor;
        this.documentRepo = dependencies.repositories.document;
        this.batchRepo = dependencies.repositories.batch;
        this.chunkRepo = dependencies.repositories.chunk;
        this.promptConfigRepo = dependencies.repositories.promptConfig;
        this.logger = logger;

        // Enhancement handler needs GeminiService for now (will be refactored later)
        const geminiService = dependencies.llm as GeminiService;
        this.enhancementHandler = createEnhancementHandler(
            config.ragEnhancement,
            config,
            geminiService
        );

        this.batchProcessor = new BatchProcessor(
            config,
            geminiService,
            dependencies.embeddingProvider,
            this.enhancementHandler,
            this.batchRepo as any,
            this.chunkRepo as any,
            this.documentRepo as any,
            logger
        );
    }



    /**
     * Collect processing warnings from batch results
     */
    private collectWarnings(batchResults: BatchResult[], failedCount: number): ProcessingWarning[] | undefined {
        const warnings: ProcessingWarning[] = [];

        // Add warning for failed batches
        if (failedCount > 0) {
            warnings.push({
                type: 'PARSE_ERROR',
                message: `${failedCount} batch(es) failed to process`,
                details: {
                    failedBatches: batchResults.filter(b => b.error).map(b => ({
                        batch: b.batchIndex,
                        error: b.error,
                    })),
                },
            });
        }

        // Check for low confidence batches
        const lowConfidenceBatches = batchResults.filter(b => b.chunksCreated === 0 && !b.error);
        if (lowConfidenceBatches.length > 0) {
            warnings.push({
                type: 'LOW_CONFIDENCE',
                message: `${lowConfidenceBatches.length} batch(es) produced no chunks`,
                details: { batches: lowConfidenceBatches.map(b => b.batchIndex) },
            });
        }

        return warnings.length > 0 ? warnings : undefined;
    }

    /**
     * Ingest a document
     */
    async ingest(options: IngestOptions): Promise<IngestResult> {
        const startTime = Date.now();

        this.logger.info('Starting ingestion', {
            documentType: options.documentType,
        });

        // Load PDF
        const { buffer, metadata } = await this.pdfProcessor.load(options.file);

        // Upload PDF to LLM provider (cache for batch processing and context generation)
        const fileUri = await this.llm.uploadDocument(buffer, metadata.filename);

        // Check for existing document (by hash + experimentId)
        if (options.skipExisting) {
            const existing = await this.documentRepo.getByHashAndExperiment(
                metadata.fileHash,
                options.experimentId
            );
            if (existing) {
                this.logger.info('Document already exists for this experiment, skipping', {
                    documentId: existing.id,
                    experimentId: options.experimentId,
                });
                return {
                    documentId: existing.id,
                    status: existing.status as IngestResult['status'],
                    chunkCount: 0,
                    batchCount: existing.progress.totalBatches,
                    failedBatchCount: existing.progress.failedBatches,
                    tokenUsage: existing.tokenUsage ?? { input: 0, output: 0, total: 0 },
                    processingMs: 0,
                    batches: [],
                    warnings: [{
                        type: 'FALLBACK_USED',
                        message: 'Document already exists for this experiment, skipped processing',
                    }],
                };
            }
        }

        // Get document-specific instructions
        let documentInstructions: string[] = [];
        let exampleFormats: Record<string, string> | undefined;
        let promptConfigId: string | undefined = options.promptConfigId;

        if (!promptConfigId && options.documentType) {
            const promptConfig = await this.promptConfigRepo.getDefault(options.documentType);
            if (promptConfig) {
                promptConfigId = promptConfig.id;
                // Parse instructions from systemPrompt (stored as newline-separated)
                documentInstructions = promptConfig.systemPrompt
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
            }
        }

        // Use custom prompt or default instructions
        if (options.customPrompt) {
            documentInstructions = options.customPrompt
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Auto-create PromptConfig if customPrompt is provided but no promptConfigId
            if (!promptConfigId) {
                const customDocType = options.documentType ?? 'CustomPrompt';
                const existingConfig = await this.promptConfigRepo.getDefault(customDocType);

                if (existingConfig) {
                    // Use existing config
                    promptConfigId = existingConfig.id;
                    this.logger.debug('Using existing PromptConfig for customPrompt', {
                        promptConfigId,
                        documentType: customDocType
                    });
                } else {
                    // Create new PromptConfig for custom prompt
                    const newConfig = await this.promptConfigRepo.create({
                        documentType: customDocType,
                        name: `Custom Extraction - ${new Date().toISOString().slice(0, 10)}`,
                        systemPrompt: options.customPrompt,
                        chunkStrategy: {
                            maxTokens: 800,
                            splitBy: 'semantic',
                            preserveTables: true,
                            preserveLists: true,
                        },
                        setAsDefault: true,
                        changeLog: 'Auto-created from customPrompt',
                    });
                    promptConfigId = newConfig.id;
                    this.logger.info('Created new PromptConfig for customPrompt', {
                        promptConfigId,
                        documentType: customDocType
                    });
                }
            }
        } else if (documentInstructions.length === 0) {
            documentInstructions = DEFAULT_DOCUMENT_INSTRUCTIONS
                .split('\n')
                .map(line => line.replace(/^-\s*/, '').trim())
                .filter(line => line.length > 0);

            // Create default PromptConfig if none exists
            if (!promptConfigId) {
                const defaultDocType = options.documentType ?? 'General';
                const existingConfig = await this.promptConfigRepo.getDefault(defaultDocType);

                if (existingConfig) {
                    promptConfigId = existingConfig.id;
                } else {
                    const newConfig = await this.promptConfigRepo.create({
                        documentType: defaultDocType,
                        name: 'Default Extraction',
                        systemPrompt: DEFAULT_DOCUMENT_INSTRUCTIONS,
                        chunkStrategy: {
                            maxTokens: 800,
                            splitBy: 'semantic',
                            preserveTables: true,
                            preserveLists: true,
                        },
                        setAsDefault: true,
                        changeLog: 'Auto-created as system default',
                    });
                    promptConfigId = newConfig.id;
                    this.logger.info('Created default PromptConfig', {
                        promptConfigId,
                        documentType: defaultDocType
                    });
                }
            }
        }

        // Create batches
        const batchSpecs = this.pdfProcessor.createBatches(
            metadata.pageCount,
            this.config.batchConfig.pagesPerBatch
        );

        // Create document record with experiment info
        const documentId = await this.documentRepo.create({
            filename: options.filename ?? metadata.filename,
            fileHash: metadata.fileHash,
            fileSize: metadata.fileSize,
            pageCount: metadata.pageCount,
            documentType: options.documentType,
            promptConfigId,
            totalBatches: batchSpecs.length,
            experimentId: options.experimentId,
            modelName: this.config.model,
            modelConfig: {
                temperature: this.config.generationConfig?.temperature,
                maxOutputTokens: this.config.generationConfig?.maxOutputTokens,
            },
        });

        // Create batch records
        await this.batchRepo.createMany(
            batchSpecs.map(spec => ({
                documentId,
                batchIndex: spec.batchIndex,
                pageStart: spec.pageStart,
                pageEnd: spec.pageEnd,
            }))
        );

        // Update document status
        await this.documentRepo.update(documentId, {
            status: DocumentStatusEnum.PROCESSING,
        });

        // Process batches with concurrency control
        const batchResults = await this.processBatchesConcurrently(
            documentId,

            documentInstructions,
            exampleFormats,
            promptConfigId ?? 'default',
            fileUri,
            metadata.filename,
            options.onProgress
        );

        // Calculate totals
        const totalTokenUsage: TokenUsage = {
            input: 0,
            output: 0,
            total: 0,
        };
        let totalChunks = 0;
        let failedCount = 0;

        for (const result of batchResults) {
            totalTokenUsage.input += result.tokenUsage.input;
            totalTokenUsage.output += result.tokenUsage.output;
            totalTokenUsage.total += result.tokenUsage.total;
            totalChunks += result.chunksCreated;
            if (result.status === BatchStatusEnum.FAILED) {
                failedCount++;
            }
        }

        const processingMs = Date.now() - startTime;

        // Mark document as completed
        await this.documentRepo.markCompleted(documentId, totalTokenUsage, processingMs);

        const status = failedCount > 0 ? DocumentStatusEnum.PARTIAL : DocumentStatusEnum.COMPLETED;

        this.logger.info('Ingestion completed', {
            documentId,
            status,
            chunkCount: totalChunks,
            batchCount: batchSpecs.length,
            failedBatchCount: failedCount,
            processingMs,
        });

        return {
            documentId,
            status: status as IngestResult['status'],
            chunkCount: totalChunks,
            batchCount: batchSpecs.length,
            failedBatchCount: failedCount,
            tokenUsage: totalTokenUsage,
            processingMs,
            batches: batchResults,
            warnings: this.collectWarnings(batchResults, failedCount),
        };
    }

    /**
     * Process batches with concurrency control
     */
    private async processBatchesConcurrently(
        documentId: string,

        documentInstructions: string[],
        exampleFormats: Record<string, string> | undefined,
        promptConfigId: string,
        fileUri: string, // [NEW] Files API URI
        filename: string,
        onProgress?: (status: BatchStatus) => void
    ): Promise<BatchResult[]> {
        const batches = await this.batchRepo.getByDocumentId(documentId);
        const results: BatchResult[] = [];
        const { maxConcurrency } = this.config.batchConfig;

        // Process in chunks of maxConcurrency
        for (let i = 0; i < batches.length; i += maxConcurrency) {
            const currentBatch = batches.slice(i, i + maxConcurrency);

            const batchPromises = currentBatch.map(batch =>
                this.batchProcessor.processBatch(
                    batch,
                    {
                        documentInstructions,
                        exampleFormats,
                        promptConfigId,
                        fileUri,
                        filename,
                        documentId,
                        totalBatches: batches.length,
                    },
                    onProgress
                )
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return results;
    }


}
