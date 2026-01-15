import type { PrismaClientLike } from '../types/config.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import type {
    IngestOptions,
    IngestResult,
    BatchStatus,
    BatchResult,
} from '../types/ingestion.types.js';
import type { CreateChunkInput, TokenUsage } from '../types/chunk.types.js';
import { BatchStatusEnum, DocumentStatusEnum, ChunkTypeEnum, type ChunkTypeEnumType } from '../types/enums.js';
import { DocumentRepository } from '../database/repositories/document.repository.js';
import { BatchRepository } from '../database/repositories/batch.repository.js';
import { ChunkRepository } from '../database/repositories/chunk.repository.js';
import { PromptConfigRepository } from '../database/repositories/prompt-config.repository.js';
import { GeminiService } from '../services/gemini.service.js';
import { PDFProcessor } from '../services/pdf.processor.js';
import { withRetry, getRetryOptions } from '../utils/retry.js';
import type { Logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';

/**
 * System prompt for content extraction
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a document processing AI. Your task is to extract and structure content from the given document pages.

Instructions:
1. Extract all text content, preserving structure
2. Convert tables to Markdown table format
3. Convert lists to Markdown list format
4. Preserve headings with appropriate # levels
5. Note any images or figures with [IMAGE: description]
6. Maintain the logical flow of content

Output format:
- Use clean Markdown formatting
- Each distinct section should be clearly separated
- Tables must use | column | format |
- Include page numbers in comments like <!-- Page X -->

Be thorough and accurate. Do not summarize or skip content.`;

/**
 * Ingestion engine for processing documents
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

        // Check for existing document
        if (options.skipExisting) {
            const existing = await this.documentRepo.getByHash(metadata.fileHash);
            if (existing) {
                this.logger.info('Document already exists, skipping', {
                    documentId: existing.id,
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
                    warnings: ['Document already exists, skipped processing'],
                };
            }
        }

        // Get or create prompt config
        let promptConfigId: string | undefined = options.promptConfigId;
        let systemPrompt = options.customPrompt ?? EXTRACTION_SYSTEM_PROMPT;

        if (!promptConfigId && options.documentType) {
            const promptConfig = await this.promptConfigRepo.getDefault(options.documentType);
            if (promptConfig) {
                promptConfigId = promptConfig.id;
                systemPrompt = promptConfig.systemPrompt;
            }
        }

        // Create batches
        const batchSpecs = this.pdfProcessor.createBatches(
            metadata.pageCount,
            this.config.batchConfig.pagesPerBatch
        );

        // Create document record
        const documentId = await this.documentRepo.create({
            filename: options.filename ?? metadata.filename,
            fileHash: metadata.fileHash,
            fileSize: metadata.fileSize,
            pageCount: metadata.pageCount,
            documentType: options.documentType,
            promptConfigId,
            totalBatches: batchSpecs.length,
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
            buffer,
            systemPrompt,
            promptConfigId ?? 'default',
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
        pdfBuffer: Buffer,
        systemPrompt: string,
        promptConfigId: string,
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
                    pdfBuffer,
                    systemPrompt,
                    promptConfigId,
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
        pdfBuffer: Buffer,
        systemPrompt: string,
        promptConfigId: string,
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
                    // Create vision part from PDF
                    const pdfPart = this.pdfProcessor.createVisionPart(pdfBuffer);
                    const pageRange = this.pdfProcessor.getPageRangeDescription(
                        batch.pageStart,
                        batch.pageEnd
                    );

                    // Generate content with vision
                    const prompt = `${systemPrompt}\n\nProcess ${pageRange} of this document.`;
                    const response = await this.gemini.generateWithVision(prompt, [pdfPart]);

                    return response;
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

            // Parse and create chunks
            const chunks = this.parseContentToChunks(
                result.text,
                promptConfigId,
                documentId,
                batch.pageStart,
                batch.pageEnd
            );

            // Generate embeddings and save chunks
            const embeddings = await this.gemini.embedBatch(
                chunks.map(c => c.searchContent)
            );

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
     */
    private parseContentToChunks(
        content: string,
        promptConfigId: string,
        documentId: string,
        pageStart: number,
        pageEnd: number
    ): CreateChunkInput[] {
        const chunks: CreateChunkInput[] = [];

        // Split content by sections (double newlines or headers)
        const sections = content.split(/\n(?=#{1,6}\s)|(?:\n\n)/);

        let chunkIndex = 0;
        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed || trimmed.length < 10) continue;

            // Detect chunk type
            const chunkType = this.detectChunkType(trimmed);

            chunks.push({
                promptConfigId,
                documentId,
                chunkIndex: chunkIndex++,
                chunkType,
                searchContent: this.cleanForSearch(trimmed),
                displayContent: trimmed,
                sourcePageStart: pageStart,
                sourcePageEnd: pageEnd,
                confidenceScore: 0.8, // Default, could be enhanced
                metadata: {
                    type: chunkType,
                    pageRange: { start: pageStart, end: pageEnd },
                    confidence: { score: 0.8, category: 'HIGH' },
                },
            });
        }

        return chunks;
    }

    /**
     * Detect the type of content in a chunk
     */
    private detectChunkType(content: string): ChunkTypeEnumType {
        if (content.includes('|') && content.includes('---')) {
            return ChunkTypeEnum.TABLE;
        }
        if (/^[-*]\s/.test(content) || /^\d+\.\s/.test(content)) {
            return ChunkTypeEnum.LIST;
        }
        if (content.startsWith('```')) {
            return ChunkTypeEnum.CODE;
        }
        if (/^#{1,6}\s/.test(content)) {
            return ChunkTypeEnum.HEADING;
        }
        if (content.startsWith('>')) {
            return ChunkTypeEnum.QUOTE;
        }
        return ChunkTypeEnum.TEXT;
    }

    /**
     * Clean content for search (remove formatting)
     */
    private cleanForSearch(content: string): string {
        return content
            .replace(/#{1,6}\s/g, '') // Remove heading markers
            .replace(/\*\*/g, '') // Remove bold
            .replace(/\*/g, '') // Remove italic
            .replace(/`/g, '') // Remove code markers
            .replace(/\|/g, ' ') // Replace table pipes with spaces
            .replace(/---+/g, '') // Remove hr
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
}
