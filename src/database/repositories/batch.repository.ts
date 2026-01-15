import type { PrismaClientLike } from '../types/config.types.js';
import { BatchStatusEnum } from '../types/enums.js';
import type { TokenUsage } from '../types/chunk.types.js';
import { DatabaseError, NotFoundError } from '../errors/index.js';

interface CreateBatchInput {
    documentId: string;
    batchIndex: number;
    pageStart: number;
    pageEnd: number;
}

interface BatchRecord {
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
 * Repository for Batch CRUD operations
 */
export class BatchRepository {
    constructor(private readonly prisma: PrismaClientLike) { }

    /**
     * Create multiple batches for a document
     */
    async createMany(inputs: CreateBatchInput[]): Promise<void> {
        try {
            await this.prisma.contextRagBatch.createMany({
                data: inputs.map(input => ({
                    documentId: input.documentId,
                    batchIndex: input.batchIndex,
                    pageStart: input.pageStart,
                    pageEnd: input.pageEnd,
                    status: BatchStatusEnum.PENDING,
                })),
            });
        } catch (error) {
            throw new DatabaseError('Failed to create batches', {
                error: (error as Error).message,
            });
        }
    }

    /**
     * Get batch by ID
     */
    async getById(id: string): Promise<BatchRecord> {
        const batch = await this.prisma.contextRagBatch.findUnique({
            where: { id },
        });

        if (!batch) {
            throw new NotFoundError('Batch', id);
        }

        return this.mapToBatchRecord(batch);
    }

    /**
     * Get all batches for a document
     */
    async getByDocumentId(documentId: string): Promise<BatchRecord[]> {
        const batches = await this.prisma.contextRagBatch.findMany({
            where: { documentId },
            orderBy: { batchIndex: 'asc' },
        });

        return batches.map((b: Record<string, unknown>) => this.mapToBatchRecord(b));
    }

    /**
     * Get pending batches for a document
     */
    async getPending(documentId: string): Promise<BatchRecord[]> {
        const batches = await this.prisma.contextRagBatch.findMany({
            where: {
                documentId,
                status: BatchStatusEnum.PENDING,
            },
            orderBy: { batchIndex: 'asc' },
        });

        return batches.map((b: Record<string, unknown>) => this.mapToBatchRecord(b));
    }

    /**
     * Get failed batches for retry
     */
    async getFailed(documentId: string, maxRetries: number): Promise<BatchRecord[]> {
        const batches = await this.prisma.contextRagBatch.findMany({
            where: {
                documentId,
                status: BatchStatusEnum.FAILED,
                retryCount: { lt: maxRetries },
            },
            orderBy: { batchIndex: 'asc' },
        });

        return batches.map((b: Record<string, unknown>) => this.mapToBatchRecord(b));
    }

    /**
     * Mark batch as processing
     */
    async markProcessing(id: string): Promise<void> {
        await this.prisma.contextRagBatch.update({
            where: { id },
            data: {
                status: BatchStatusEnum.PROCESSING,
                startedAt: new Date(),
            },
        });
    }

    /**
     * Mark batch as retrying
     */
    async markRetrying(id: string, error: string): Promise<void> {
        await this.prisma.contextRagBatch.update({
            where: { id },
            data: {
                status: BatchStatusEnum.RETRYING,
                lastError: error,
                retryCount: { increment: 1 },
            },
        });
    }

    /**
     * Mark batch as completed
     */
    async markCompleted(
        id: string,
        tokenUsage: TokenUsage,
        processingMs: number
    ): Promise<void> {
        await this.prisma.contextRagBatch.update({
            where: { id },
            data: {
                status: BatchStatusEnum.COMPLETED,
                tokenUsage,
                processingMs,
                completedAt: new Date(),
            },
        });
    }

    /**
     * Mark batch as failed
     */
    async markFailed(id: string, error: string): Promise<void> {
        await this.prisma.contextRagBatch.update({
            where: { id },
            data: {
                status: BatchStatusEnum.FAILED,
                lastError: error,
                completedAt: new Date(),
            },
        });
    }

    /**
     * Reset batch for retry (set back to pending)
     */
    async resetForRetry(id: string): Promise<void> {
        await this.prisma.contextRagBatch.update({
            where: { id },
            data: {
                status: BatchStatusEnum.PENDING,
                startedAt: null,
                completedAt: null,
            },
        });
    }

    /**
     * Map database record to BatchRecord type
     */
    private mapToBatchRecord(record: Record<string, unknown>): BatchRecord {
        return {
            id: record['id'] as string,
            documentId: record['documentId'] as string,
            batchIndex: record['batchIndex'] as number,
            pageStart: record['pageStart'] as number,
            pageEnd: record['pageEnd'] as number,
            status: record['status'] as string,
            retryCount: record['retryCount'] as number,
            lastError: record['lastError'] as string | undefined,
            tokenUsage: record['tokenUsage'] as TokenUsage | undefined,
            processingMs: record['processingMs'] as number | undefined,
            startedAt: record['startedAt'] as Date | undefined,
            completedAt: record['completedAt'] as Date | undefined,
            createdAt: record['createdAt'] as Date,
        };
    }
}
