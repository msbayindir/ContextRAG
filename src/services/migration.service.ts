/**
 * Migration Service
 * 
 * Handles embedding model migration and re-indexing operations.
 * Used when switching between embedding providers or upgrading models.
 */

import type { PrismaClientLike, ResolvedConfig } from '../types/config.types.js';
import type { EmbeddingProvider } from '../types/embedding-provider.types.js';
import type {
    MismatchResult,
    ReindexOptions,
    ReindexResult,
    ReindexProgress,
} from '../types/migration.types.js';
import { checkEmbeddingMismatch } from '../utils/embedding-utils.js';
import type { Logger } from '../utils/logger.js';

/**
 * Service for managing embedding migrations
 */
export class MigrationService {
    private readonly prisma: PrismaClientLike;
    private readonly embeddingProvider: EmbeddingProvider;
    private readonly logger: Logger;

    constructor(
        prisma: PrismaClientLike,
        embeddingProvider: EmbeddingProvider,
        _config: ResolvedConfig, // Reserved for future use
        logger: Logger
    ) {
        this.prisma = prisma;
        this.embeddingProvider = embeddingProvider;
        this.logger = logger;
    }

    /**
     * Check if current embedding config matches stored embeddings
     */
    async checkMismatch(): Promise<MismatchResult> {
        return checkEmbeddingMismatch(this.prisma, this.embeddingProvider);
    }

    /**
     * Re-index all chunks with new embedding provider
     */
    async reindex(options?: ReindexOptions): Promise<ReindexResult> {
        const startTime = Date.now();
        const opts = {
            concurrency: options?.concurrency ?? 5,
            batchSize: options?.batchSize ?? 50,
            skipMatching: options?.skipMatching ?? true,
            documentIds: options?.documentIds,
            onProgress: options?.onProgress,
        };

        this.logger.info('Starting re-indexing operation', {
            concurrency: opts.concurrency,
            batchSize: opts.batchSize,
            documentIds: opts.documentIds?.length ?? 'all',
        });

        // Build where clause
        const whereClause: Record<string, unknown> = {};

        if (opts.documentIds && opts.documentIds.length > 0) {
            whereClause['documentId'] = { in: opts.documentIds };
        }

        if (opts.skipMatching) {
            whereClause['OR'] = [
                { embeddingModel: null },
                { embeddingModel: { not: this.embeddingProvider.id } },
            ];
        }

        // Get total count
        const totalChunks = await this.prisma.contextRagChunk.count({ where: whereClause });

        if (totalChunks === 0) {
            this.logger.info('No chunks to re-index');
            return {
                success: true,
                totalProcessed: 0,
                succeeded: 0,
                failed: 0,
                failures: [],
                durationMs: Date.now() - startTime,
                newModel: this.embeddingProvider.id,
            };
        }

        const result: ReindexResult = {
            success: true,
            totalProcessed: 0,
            succeeded: 0,
            failed: 0,
            failures: [],
            durationMs: 0,
            newModel: this.embeddingProvider.id,
        };

        // Process in batches
        let offset = 0;

        while (offset < totalChunks) {
            // Fetch batch
            const chunks = await this.prisma.contextRagChunk.findMany({
                where: whereClause,
                select: {
                    id: true,
                    searchContent: true,
                    enrichedContent: true,
                },
                take: opts.batchSize,
                skip: offset,
                orderBy: { createdAt: 'asc' },
            });

            if (chunks.length === 0) break;

            // Process chunks with concurrency limit
            const batchResults = await this.processBatch(chunks, opts.concurrency);

            result.totalProcessed += batchResults.length;

            for (const batchResult of batchResults) {
                if (batchResult.success) {
                    result.succeeded++;
                } else {
                    result.failed++;
                    result.failures.push({
                        chunkId: batchResult.chunkId,
                        error: batchResult.error ?? 'Unknown error',
                    });
                }
            }

            // Report progress
            if (opts.onProgress) {
                const progress: ReindexProgress = {
                    total: totalChunks,
                    processed: result.totalProcessed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                    phase: offset + opts.batchSize >= totalChunks ? 'complete' : 'embedding',
                    estimatedSecondsRemaining: this.estimateRemaining(
                        startTime,
                        result.totalProcessed,
                        totalChunks
                    ),
                };
                opts.onProgress(progress);
            }

            offset += opts.batchSize;

            this.logger.debug('Batch processed', {
                offset,
                total: totalChunks,
                succeeded: result.succeeded,
                failed: result.failed,
            });
        }

        result.durationMs = Date.now() - startTime;
        result.success = result.failed === 0;

        this.logger.info('Re-indexing completed', {
            totalProcessed: result.totalProcessed,
            succeeded: result.succeeded,
            failed: result.failed,
            durationMs: result.durationMs,
        });

        return result;
    }

    /**
     * Re-index chunks for a specific document
     */
    async reindexDocument(documentId: string): Promise<ReindexResult> {
        return this.reindex({
            documentIds: [documentId],
            skipMatching: false, // Re-index all chunks for this document
        });
    }

    /**
     * Process a batch of chunks with concurrency limit
     */
    private async processBatch(
        chunks: Array<{ id: string; searchContent: string; enrichedContent: string | null }>,
        concurrency: number
    ): Promise<Array<{ chunkId: string; success: boolean; error?: string }>> {
        const results: Array<{ chunkId: string; success: boolean; error?: string }> = [];

        // Process in groups of `concurrency`
        for (let i = 0; i < chunks.length; i += concurrency) {
            const group = chunks.slice(i, i + concurrency);

            const promises = group.map(async (chunk) => {
                try {
                    // Use enrichedContent if available, otherwise searchContent
                    const textToEmbed = chunk.enrichedContent ?? chunk.searchContent;

                    // Generate new embedding
                    const embeddingResult = await this.embeddingProvider.embedDocument(textToEmbed);

                    // Update chunk with new embedding
                    await this.prisma.$executeRaw`
                        UPDATE context_rag_chunks 
                        SET 
                            search_vector = ${embeddingResult.embedding}::vector,
                            embedding_model = ${this.embeddingProvider.id},
                            embedding_dimension = ${this.embeddingProvider.dimension}
                        WHERE id = ${chunk.id}
                    `;

                    return { chunkId: chunk.id, success: true };
                } catch (error) {
                    return {
                        chunkId: chunk.id,
                        success: false,
                        error: (error as Error).message,
                    };
                }
            });

            const groupResults = await Promise.all(promises);
            results.push(...groupResults);
        }

        return results;
    }

    /**
     * Estimate remaining time based on progress
     */
    private estimateRemaining(startTime: number, processed: number, total: number): number {
        if (processed === 0) return 0;

        const elapsed = Date.now() - startTime;
        const avgTimePerChunk = elapsed / processed;
        const remaining = total - processed;

        return Math.round((remaining * avgTimePerChunk) / 1000);
    }
}
