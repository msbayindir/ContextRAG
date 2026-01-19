
import type { PrismaClientLike } from '../types/config.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import type {
    IngestOptions,
    IngestResult,
    BatchStatus,
    BatchResult,
} from '../types/ingestion.types.js';
import type { CreateChunkInput, TokenUsage } from '../types/chunk.types.js';
import { BatchStatusEnum, DocumentStatusEnum } from '../types/enums.js';
import { DocumentRepository } from '../database/repositories/document.repository.js';
import { BatchRepository } from '../database/repositories/batch.repository.js';
import { ChunkRepository } from '../database/repositories/chunk.repository.js';
import { PromptConfigRepository } from '../database/repositories/prompt-config.repository.js';
import { GeminiService } from '../services/gemini.service.js';
import { PDFProcessor } from '../services/pdf.processor.js';
import { withRetry, getRetryOptions } from '../utils/retry.js';
import type { Logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import {
    buildExtractionPrompt,
    DEFAULT_DOCUMENT_INSTRUCTIONS
} from '../config/templates.js';
import {
    parseSections,
    hasValidSections,
    parseFallbackContent,
    cleanForSearch
} from '../utils/chunk-parser.js';
import { createEnhancementHandler } from '../enhancements/enhancement-registry.js';
import type { EnhancementHandler, DocumentContext, ChunkData } from '../types/rag-enhancement.types.js';
import { SectionArraySchema, type SectionArray } from '../schemas/index.js';

/**
 * Ingestion engine for processing documents
 * 
 * Uses structured template system for consistent output format
 * with <!-- SECTION --> markers for reliable parsing.
 */
export class IngestionEngine {
    private readonly config: ResolvedConfig;
    private readonly prisma: PrismaClientLike;
    private readonly gemini: GeminiService;
    private readonly pdfProcessor: PDFProcessor;
    private readonly documentRepo: DocumentRepository;
    private readonly batchRepo: BatchRepository;
    private readonly chunkRepo: ChunkRepository;
    private readonly promptConfigRepo: PromptConfigRepository;
    private readonly logger: Logger;
    private readonly enhancementHandler: EnhancementHandler;

    constructor(
        config: ResolvedConfig,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.config = config;
        this.prisma = config.prisma;
        this.gemini = new GeminiService(config, rateLimiter, logger);
        this.pdfProcessor = new PDFProcessor(logger);
        this.documentRepo = new DocumentRepository(this.prisma);
        this.batchRepo = new BatchRepository(this.prisma);
        this.chunkRepo = new ChunkRepository(this.prisma);
        this.promptConfigRepo = new PromptConfigRepository(this.prisma);
        this.logger = logger;
        this.enhancementHandler = createEnhancementHandler(
            config.ragEnhancement,
            config,
            this.gemini
        );
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

        // Upload PDF to Gemini Files API (cache for batch processing and context generation)
        const fileUri = await this.gemini.uploadPdfBuffer(buffer, metadata.filename);

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
                    warnings: ['Document already exists for this experiment, skipped processing'],
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
        } else if (documentInstructions.length === 0) {
            documentInstructions = DEFAULT_DOCUMENT_INSTRUCTIONS
                .split('\n')
                .map(line => line.replace(/^-\s*/, '').trim())
                .filter(line => line.length > 0);
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
            // buffer removed
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
            warnings: failedCount > 0 ? [`${failedCount} batch(es) failed to process`] : undefined,
        };
    }

    /**
     * Process batches with concurrency control
     */
    private async processBatchesConcurrently(
        documentId: string,
        // pdfBuffer removed - using Files API fileUri instead
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
                this.processSingleBatch(
                    batch,
                    // pdfBuffer removed
                    documentInstructions,
                    exampleFormats,
                    promptConfigId,
                    fileUri,
                    filename,
                    documentId,
                    batches.length,
                    onProgress
                )
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Process a single batch with retry logic
     */
    private async processSingleBatch(
        batch: { id: string; batchIndex: number; pageStart: number; pageEnd: number },
        // pdfBuffer removed
        documentInstructions: string[],
        exampleFormats: Record<string, string> | undefined,
        promptConfigId: string,
        fileUri: string,
        filename: string,
        documentId: string,
        totalBatches: number,
        onProgress?: (status: BatchStatus) => void
    ): Promise<BatchResult> {
        const startTime = Date.now();

        // Report progress
        onProgress?.({
            current: batch.batchIndex + 1,
            total: totalBatches,
            status: BatchStatusEnum.PROCESSING,
            pageRange: { start: batch.pageStart, end: batch.pageEnd },
        });

        await this.batchRepo.markProcessing(batch.id);

        const retryOptions = getRetryOptions(this.config.batchConfig);
        let retryCount = 0;

        try {
            const result = await withRetry(
                async () => {
                    // Build prompt based on whether we use structured output or legacy
                    const useStructured = this.config.useStructuredOutput;

                    const getPrompt = (structured: boolean): string => {
                        const basePrompt = buildExtractionPrompt(
                            documentInstructions,
                            exampleFormats,
                            batch.pageStart,
                            batch.pageEnd,
                            structured
                        );
                        return `${basePrompt}
                    
                    IMPORTANT: You have the FULL document. Restrict your extraction STRICTLY to pages ${batch.pageStart} to ${batch.pageEnd}. Do not extract content from other pages.`;
                    };

                    // Try structured output first if enabled
                    if (useStructured) {
                        try {
                            const structuredResponse = await this.gemini.generateStructuredWithPdf(
                                fileUri,
                                getPrompt(true),
                                SectionArraySchema,
                                {
                                    temperature: this.config.generationConfig?.temperature,
                                    maxOutputTokens: this.config.generationConfig?.maxOutputTokens,
                                }
                            );

                            this.logger.debug('Structured extraction success', {
                                batchId: batch.id,
                                chunkCount: structuredResponse.data.length
                            });

                            return structuredResponse;
                        } catch (structuredError) {
                            this.logger.warn('Structured extraction failed, falling back to legacy parsing', {
                                batchId: batch.id,
                                error: (structuredError as Error).message
                            });
                            // Fallback to legacy text generation
                        }
                    }

                    // Fallback to legacy text generation (or if structured output disabled)
                    // Note: We deliberately use legacy prompt (false) here to ensure XML tags are present for regex parser
                    return await this.gemini.generateWithPdfUri(
                        fileUri,
                        getPrompt(false),
                        {
                            temperature: this.config.generationConfig?.temperature,
                            maxOutputTokens: this.config.generationConfig?.maxOutputTokens,
                        }
                    );
                },
                {
                    ...retryOptions,
                    onRetry: (attempt, error) => {
                        retryCount = attempt;
                        this.logger.warn('Batch retry', {
                            batchId: batch.id,
                            attempt,
                            error: error.message,
                        });
                        onProgress?.({
                            current: batch.batchIndex + 1,
                            total: totalBatches,
                            status: BatchStatusEnum.RETRYING,
                            pageRange: { start: batch.pageStart, end: batch.pageEnd },
                            retryCount: attempt,
                        });
                    },
                }
            );

            // Process results based on response type
            let chunks: CreateChunkInput[];

            // Check if result is structured data or text response
            if ('data' in result && Array.isArray(result.data)) {
                // Handle Structured Output
                const sections = result.data as SectionArray;

                chunks = sections.map((section, index) => ({
                    promptConfigId,
                    documentId,
                    chunkIndex: index,
                    chunkType: section.type,
                    searchContent: cleanForSearch(section.content),
                    displayContent: section.content,
                    sourcePageStart: section.page,
                    sourcePageEnd: section.page,
                    confidenceScore: section.confidence,
                    metadata: {
                        type: section.type,
                        pageRange: { start: section.page, end: section.page },
                        confidence: {
                            score: section.confidence,
                            category: section.confidence >= 0.8 ? 'HIGH' :
                                section.confidence >= 0.5 ? 'MEDIUM' : 'LOW'
                        },
                        parsedWithStructuredMarkers: true,
                        parsingMethod: 'gemini_response_schema'
                    },
                }));
            } else {
                // Handle Legacy Text Response
                const textResponse = result as { text: string };
                chunks = this.parseContentToChunks(
                    textResponse.text,
                    promptConfigId,
                    documentId,
                    batch.pageStart,
                    batch.pageEnd
                );
            }

            // RAG Enhancement: Generate context for each chunk (Anthropic-style)
            const docContext: DocumentContext = {
                documentType: undefined, // Inferred from processing
                filename: filename,
                pageCount: batch.pageEnd, // Approximate from batch
                fileUri: fileUri, // Pass the Files API URI for context generation
            };

            // Generate context and create enriched content
            for (const chunk of chunks) {
                const chunkData: ChunkData = {
                    content: chunk.displayContent,
                    searchContent: chunk.searchContent,
                    displayContent: chunk.displayContent,
                    chunkType: chunk.chunkType,
                    page: chunk.sourcePageStart,
                    parentHeading: undefined, // Could be extracted from metadata
                };

                // Generate context using enhancement handler
                const context = await this.enhancementHandler.generateContext(chunkData, docContext);

                // Store context and create enriched content
                if (context) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (chunk as any).contextText = context;
                    const enriched = `${context} ${chunk.searchContent}`;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (chunk as any).enrichedContent = enriched;

                    // [Context-RAG Update]
                    // Update searchContent to include context for proper hybrid search indexing.
                    // This aligns with Anthropic's Contextual Retrieval architecture where 
                    // the BM25 (Keyword) index is built from the "Context + Chunk" content.
                    chunk.searchContent = enriched;
                }
            }

            // Generate embeddings using enrichedContent if available, otherwise searchContent
            const textsToEmbed = chunks.map(c =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (c as any).enrichedContent ?? c.searchContent
            );
            const embeddings = await this.gemini.embedBatch(textsToEmbed);

            await this.chunkRepo.createMany(
                chunks,
                embeddings.map(e => e.embedding)
            );

            // Mark batch as completed
            const processingMs = Date.now() - startTime;
            await this.batchRepo.markCompleted(batch.id, result.tokenUsage, processingMs);
            await this.documentRepo.incrementCompleted(documentId);

            onProgress?.({
                current: batch.batchIndex + 1,
                total: totalBatches,
                status: BatchStatusEnum.COMPLETED,
                pageRange: { start: batch.pageStart, end: batch.pageEnd },
            });

            return {
                batchIndex: batch.batchIndex,
                status: BatchStatusEnum.COMPLETED,
                chunksCreated: chunks.length,
                tokenUsage: result.tokenUsage,
                processingMs,
                retryCount,
            };
        } catch (error) {
            const errorMessage = (error as Error).message;

            await this.batchRepo.markFailed(batch.id, errorMessage);
            await this.documentRepo.incrementFailed(documentId);

            onProgress?.({
                current: batch.batchIndex + 1,
                total: totalBatches,
                status: BatchStatusEnum.FAILED,
                pageRange: { start: batch.pageStart, end: batch.pageEnd },
                error: errorMessage,
            });

            this.logger.error('Batch failed', {
                batchId: batch.id,
                error: errorMessage,
            });

            return {
                batchIndex: batch.batchIndex,
                status: BatchStatusEnum.FAILED,
                chunksCreated: 0,
                tokenUsage: { input: 0, output: 0, total: 0 },
                processingMs: Date.now() - startTime,
                retryCount,
                error: errorMessage,
            };
        }
    }

    /**
     * Parse extracted content into chunks
     * Uses structured <!-- SECTION --> markers when available,
     * falls back to legacy parsing for compatibility.
     */
    private parseContentToChunks(
        content: string,
        promptConfigId: string,
        documentId: string,
        pageStart: number,
        pageEnd: number
    ): CreateChunkInput[] {
        const chunks: CreateChunkInput[] = [];

        // Try structured section parsing first
        if (hasValidSections(content)) {
            const sections = parseSections(content);

            this.logger.debug('Using structured section parser', {
                sectionCount: sections.length,
            });

            for (const section of sections) {
                if (section.content.length < 10) continue;

                chunks.push({
                    promptConfigId,
                    documentId,
                    chunkIndex: section.index,
                    chunkType: section.type,
                    searchContent: cleanForSearch(section.content),
                    displayContent: section.content,
                    sourcePageStart: section.page,
                    sourcePageEnd: section.page,
                    confidenceScore: section.confidence,
                    metadata: {
                        type: section.type,
                        pageRange: { start: section.page, end: section.page },
                        confidence: {
                            score: section.confidence,
                            category: section.confidence >= 0.8 ? 'HIGH' :
                                section.confidence >= 0.5 ? 'MEDIUM' : 'LOW'
                        },
                        parsedWithStructuredMarkers: true,
                    },
                });
            }

            return chunks;
        }

        // Fallback to legacy parsing
        this.logger.debug('Using fallback parser (no structured markers found)');

        const sections = parseFallbackContent(content, pageStart, pageEnd);

        for (const section of sections) {
            if (section.content.length < 10) continue;

            chunks.push({
                promptConfigId,
                documentId,
                chunkIndex: section.index,
                chunkType: section.type,
                searchContent: cleanForSearch(section.content),
                displayContent: section.content,
                sourcePageStart: pageStart,
                sourcePageEnd: pageEnd,
                confidenceScore: section.confidence,
                metadata: {
                    type: section.type,
                    pageRange: { start: pageStart, end: pageEnd },
                    confidence: { score: section.confidence, category: 'MEDIUM' },
                    parsedWithStructuredMarkers: false,
                },
            });
        }

        return chunks;
    }
}
