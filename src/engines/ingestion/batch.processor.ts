import type { ResolvedConfig } from '../../types/config.types.js';
import type { BatchResult, BatchStatus } from '../../types/ingestion.types.js';
import type { CreateChunkInput } from '../../types/chunk.types.js';
import type { ChunkTypeEnumType } from '../../types/enums.js';
import { BatchStatusEnum } from '../../types/enums.js';
import { BatchRepository } from '../../database/repositories/batch.repository.js';
import { ChunkRepository } from '../../database/repositories/chunk.repository.js';
import { DocumentRepository } from '../../database/repositories/document.repository.js';
import { GeminiService } from '../../services/gemini.service.js';
import type { EmbeddingProvider } from '../../types/embedding-provider.types.js';
import type { EnhancementHandler, DocumentContext, ChunkData } from '../../types/rag-enhancement.types.js';
import type { Logger } from '../../utils/logger.js';
import { withRetry, getRetryOptions } from '../../utils/retry.js';
import { buildExtractionPrompt } from '../../config/templates.js';
import { SectionArraySchema, type SectionArray } from '../../schemas/index.js';
import {
    parseSections,
    hasValidSections,
    parseFallbackContent,
    processSection
} from '../../utils/chunk-parser.js';

export class BatchProcessor {
    constructor(
        private readonly config: ResolvedConfig,
        private readonly gemini: GeminiService,
        private readonly embeddingProvider: EmbeddingProvider,
        private readonly enhancementHandler: EnhancementHandler,
        private readonly batchRepo: BatchRepository,
        private readonly chunkRepo: ChunkRepository,
        private readonly documentRepo: DocumentRepository,
        private readonly logger: Logger
    ) { }

    /**
     * Process a single batch with retry logic
     */
    async processBatch(
        batch: { id: string; batchIndex: number; pageStart: number; pageEnd: number },
        context: {
            documentInstructions: string[];
            exampleFormats: Record<string, string> | undefined;
            promptConfigId: string;
            fileUri: string;
            filename: string;
            documentId: string;
            totalBatches: number;
        },
        onProgress?: (status: BatchStatus) => void
    ): Promise<BatchResult> {
        const startTime = Date.now();

        // Report progress
        onProgress?.({
            current: batch.batchIndex + 1,
            total: context.totalBatches,
            status: BatchStatusEnum.PROCESSING,
            pageRange: { start: batch.pageStart, end: batch.pageEnd },
        });

        await this.batchRepo.markProcessing(batch.id);

        const retryOptions = getRetryOptions(this.config.batchConfig);
        let retryCount = 0;

        try {
            const result = await withRetry(
                async () => {
                    const useStructured = this.config.useStructuredOutput;

                    const getPrompt = (structured: boolean): string => {
                        const basePrompt = buildExtractionPrompt(
                            context.documentInstructions,
                            context.exampleFormats,
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
                                context.fileUri,
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

                            return {
                                ...structuredResponse,
                                data: structuredResponse.data // Explicit return to satisfy Promise<BatchResult> if it matched, but actually it returns Gemini response here
                            };
                        } catch (structuredError) {
                            this.logger.warn('Structured extraction failed, falling back to legacy parsing', {
                                batchId: batch.id,
                                error: (structuredError as Error).message
                            });
                        }
                    }

                    // Fallback to legacy text generation
                    return await this.gemini.generateWithPdfUri(
                        context.fileUri,
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
                            total: context.totalBatches,
                            status: BatchStatusEnum.RETRYING,
                            pageRange: { start: batch.pageStart, end: batch.pageEnd },
                            retryCount: attempt,
                        });
                    },
                }
            );

            // Process results based on response type
            let chunks: CreateChunkInput[];

            if ('data' in result && Array.isArray(result.data)) {
                // Handle Structured Output
                const sections = result.data as SectionArray;
                chunks = sections.map((section, index) => {
                    const { chunkType, originalType } = this.applyChunkTypeMapping(section.type);
                    // Create ParsedSection-like object for processing
                    const processed = processSection({
                        ...section,
                        index,
                        type: chunkType // Ensure we use the mapped type (or original if types match)
                    });

                    return {
                        promptConfigId: context.promptConfigId,
                        documentId: context.documentId,
                        chunkIndex: index,
                        chunkType: chunkType,
                        searchContent: processed.searchContent, // Use processed content
                        displayContent: processed.displayContent,
                        sourcePageStart: section.page,
                        sourcePageEnd: section.page,
                        confidenceScore: section.confidence,
                        metadata: {
                            type: chunkType,
                            pageRange: { start: section.page, end: section.page },
                            confidence: {
                                score: section.confidence,
                                category: section.confidence >= 0.8 ? 'HIGH' :
                                    section.confidence >= 0.5 ? 'MEDIUM' : 'LOW'
                            },
                            parsedWithStructuredMarkers: true,
                            parsingMethod: 'gemini_response_schema',
                            originalType: originalType,
                        },
                    };
                });
            } else {
                // Handle Legacy Text Response
                const textResponse = result as { text: string };
                chunks = this.parseContentToChunks(
                    textResponse.text,
                    context.promptConfigId,
                    context.documentId,
                    batch.pageStart,
                    batch.pageEnd
                );
            }

            // RAG Enhancement
            const docContext: DocumentContext = {
                documentType: undefined,
                filename: context.filename,
                pageCount: batch.pageEnd,
                fileUri: context.fileUri,
            };

            for (const chunk of chunks) {
                const chunkData: ChunkData = {
                    content: chunk.displayContent,
                    searchContent: chunk.searchContent, // Updated to use pre-calculated searchContent
                    displayContent: chunk.displayContent,
                    chunkType: chunk.chunkType,
                    page: chunk.sourcePageStart,
                    parentHeading: undefined,
                };

                const enhancement = await this.enhancementHandler.generateContext(chunkData, docContext);

                if (enhancement) {
                    chunk.contextText = enhancement;
                    const enriched = `${enhancement} ${chunk.searchContent}`;
                    chunk.enrichedContent = enriched;
                    chunk.searchContent = enriched;
                }
            }

            // Generate embeddings
            const textsToEmbed = chunks.map(c => c.enrichedContent ?? c.searchContent);
            const embeddings = await this.embeddingProvider.embedBatch(textsToEmbed);

            await this.chunkRepo.createMany(
                chunks,
                embeddings.map(e => e.embedding)
            );

            // Mark completed
            const processingMs = Date.now() - startTime;
            await this.batchRepo.markCompleted(batch.id, result.tokenUsage, processingMs);
            await this.documentRepo.incrementCompleted(context.documentId);

            onProgress?.({
                current: batch.batchIndex + 1,
                total: context.totalBatches,
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
            await this.documentRepo.incrementFailed(context.documentId);

            onProgress?.({
                current: batch.batchIndex + 1,
                total: context.totalBatches,
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

    private applyChunkTypeMapping(rawType: string): {
        chunkType: ChunkTypeEnumType;
        originalType?: string;
    } {
        const mapping = this.config.chunkTypeMapping;
        if (!mapping) return { chunkType: rawType as ChunkTypeEnumType };

        const upperType = rawType.toUpperCase();
        const mappedType = mapping[upperType] || mapping[rawType];

        if (mappedType) {
            return {
                chunkType: mappedType as ChunkTypeEnumType,
                originalType: rawType,
            };
        }
        return { chunkType: rawType as ChunkTypeEnumType };
    }

    private parseContentToChunks(
        content: string,
        promptConfigId: string,
        documentId: string,
        pageStart: number,
        pageEnd: number
    ): CreateChunkInput[] {
        const chunks: CreateChunkInput[] = [];

        if (hasValidSections(content)) {
            const sections = parseSections(content);
            for (const section of sections) {
                if (section.content.length < 10) continue;
                // Note: The logic here in original code didn't call cleanForSearch implicitly in one place but did explicitly.
                // Replicating original logic utilizing processSection helper if possible or manual
                const processed = processSection(section);

                chunks.push({
                    promptConfigId,
                    documentId,
                    chunkIndex: section.index,
                    chunkType: section.type,
                    searchContent: processed.searchContent, // cleaned
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

        const sections = parseFallbackContent(content, pageStart, pageEnd);
        for (const section of sections) {
            if (section.content.length < 10) continue;
            const processed = processSection(section);

            chunks.push({
                promptConfigId,
                documentId,
                chunkIndex: section.index,
                chunkType: section.type,
                searchContent: processed.searchContent,
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
