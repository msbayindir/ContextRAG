import type { PrismaClientLike } from '../../types/config.types.js';
import type { DocumentStatus } from '../../types/ingestion.types.js';
import type { TokenUsage } from '../../types/chunk.types.js';
import type { 
    IDocumentRepository, 
    CreateDocumentInput, 
    UpdateDocumentInput 
} from '../../types/repository.types.js';
import { DocumentStatusEnum } from '../../types/enums.js';
import { DatabaseError, NotFoundError } from '../../errors/index.js';

// Re-export types for backward compatibility
export type { CreateDocumentInput, UpdateDocumentInput };

/**
 * Repository for Document CRUD operations
 * 
 * Implements IDocumentRepository interface for dependency injection.
 * 
 * @implements {IDocumentRepository}
 */
export class DocumentRepository implements IDocumentRepository {
    constructor(private readonly prisma: PrismaClientLike) { }

    /**
     * Create a new document record
     */
    async create(input: CreateDocumentInput): Promise<string> {
        try {
            const doc = await this.prisma.contextRagDocument.create({
                data: {
                    filename: input.filename,
                    fileHash: input.fileHash,
                    fileSize: input.fileSize,
                    pageCount: input.pageCount,
                    documentType: input.documentType,
                    promptConfigId: input.promptConfigId,
                    status: DocumentStatusEnum.PENDING,
                    totalBatches: input.totalBatches,
                    experimentId: input.experimentId,
                    modelName: input.modelName,
                    modelConfig: input.modelConfig,
                },
            });

            return doc.id;
        } catch (error) {
            // Handle unique constraint violation (duplicate file + experiment)
            if ((error as { code?: string }).code === 'P2002') {
                throw new DatabaseError('Document with this hash and experimentId already exists', {
                    fileHash: input.fileHash,
                    experimentId: input.experimentId,
                });
            }
            throw new DatabaseError('Failed to create document', {
                error: (error as Error).message,
            });
        }
    }

    /**
     * Get document by ID
     */
    async getById(id: string): Promise<DocumentStatus> {
        const doc = await this.prisma.contextRagDocument.findUnique({
            where: { id },
        });

        if (!doc) {
            throw new NotFoundError('Document', id);
        }

        return this.mapToDocumentStatus(doc);
    }

    /**
     * Get document by file hash (legacy - returns first match)
     */
    async getByHash(fileHash: string): Promise<DocumentStatus | null> {
        const doc = await this.prisma.contextRagDocument.findFirst({
            where: { fileHash },
        });

        return doc ? this.mapToDocumentStatus(doc) : null;
    }

    /**
     * Get document by file hash and experiment ID
     */
    async getByHashAndExperiment(fileHash: string, experimentId?: string): Promise<DocumentStatus | null> {
        const doc = await this.prisma.contextRagDocument.findFirst({
            where: {
                fileHash,
                experimentId: experimentId ?? null,
            },
        });

        return doc ? this.mapToDocumentStatus(doc) : null;
    }

    /**
     * Update document
     */
    async update(id: string, input: UpdateDocumentInput): Promise<void> {
        await this.prisma.contextRagDocument.update({
            where: { id },
            data: input,
        });
    }

    /**
     * Increment completed batches count
     */
    async incrementCompleted(id: string): Promise<void> {
        await this.prisma.contextRagDocument.update({
            where: { id },
            data: {
                completedBatches: { increment: 1 },
            },
        });
    }

    /**
     * Increment failed batches count
     */
    async incrementFailed(id: string): Promise<void> {
        await this.prisma.contextRagDocument.update({
            where: { id },
            data: {
                failedBatches: { increment: 1 },
            },
        });
    }

    /**
     * Mark document as completed
     */
    async markCompleted(id: string, tokenUsage: TokenUsage, processingMs: number): Promise<void> {
        const doc = await this.prisma.contextRagDocument.findUnique({
            where: { id },
            select: { failedBatches: true },
        });

        const status = doc?.failedBatches > 0
            ? DocumentStatusEnum.PARTIAL
            : DocumentStatusEnum.COMPLETED;

        await this.prisma.contextRagDocument.update({
            where: { id },
            data: {
                status,
                tokenUsage,
                processingMs,
                completedAt: new Date(),
            },
        });
    }

    /**
     * Mark document as failed
     */
    async markFailed(id: string, errorMessage: string): Promise<void> {
        await this.prisma.contextRagDocument.update({
            where: { id },
            data: {
                status: DocumentStatusEnum.FAILED,
                errorMessage,
                completedAt: new Date(),
            },
        });
    }

    /**
     * Delete document and all related data
     */
    async delete(id: string): Promise<void> {
        // Chunks and batches will be cascade deleted
        await this.prisma.contextRagDocument.delete({
            where: { id },
        });
    }

    /**
     * Get documents by status
     */
    async getByStatus(status: string): Promise<DocumentStatus[]> {
        const docs = await this.prisma.contextRagDocument.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
        });

        return docs.map((d: Record<string, unknown>) => this.mapToDocumentStatus(d));
    }

    /**
     * Map database record to DocumentStatus type
     */
    private mapToDocumentStatus(record: Record<string, unknown>): DocumentStatus {
        const totalBatches = record['totalBatches'] as number;
        const completedBatches = record['completedBatches'] as number;

        return {
            id: record['id'] as string,
            filename: record['filename'] as string,
            status: record['status'] as DocumentStatus['status'],
            documentType: record['documentType'] as string | undefined,
            pageCount: record['pageCount'] as number,
            progress: {
                totalBatches,
                completedBatches,
                failedBatches: record['failedBatches'] as number,
                percentage: totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0,
            },
            tokenUsage: record['tokenUsage'] as TokenUsage | undefined,
            processingMs: record['processingMs'] as number | undefined,
            error: record['errorMessage'] as string | undefined,
            createdAt: record['createdAt'] as Date,
            completedAt: record['completedAt'] as Date | undefined,
        };
    }
}
