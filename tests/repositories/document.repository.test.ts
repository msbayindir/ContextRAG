/**
 * Document Repository Tests
 * 
 * Tests for DocumentRepository CRUD operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentRepository } from '../../src/database/repositories/document.repository.js';
import { prismaMock } from '../mocks/prisma.mock.js';
import { createMockDocumentRecord, createMockTokenUsage } from '../mocks/fixtures.js';
import { NotFoundError, DatabaseError } from '../../src/errors/index.js';

describe('DocumentRepository', () => {
    let repo: DocumentRepository;

    beforeEach(() => {
        repo = new DocumentRepository(prismaMock);
    });

    // ========================================
    // CREATE
    // ========================================

    describe('create', () => {
        it('should create document and return ID', async () => {
            const mockId = 'doc-123-uuid';
            prismaMock.contextRagDocument.create.mockResolvedValue({ id: mockId });

            const result = await repo.create({
                filename: 'test-document.pdf',
                fileHash: 'abc123def456',
                fileSize: 1024000,
                pageCount: 25,
                totalBatches: 2,
            });

            expect(result).toBe(mockId);
            expect(prismaMock.contextRagDocument.create).toHaveBeenCalledOnce();
            expect(prismaMock.contextRagDocument.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    filename: 'test-document.pdf',
                    fileHash: 'abc123def456',
                    status: 'PENDING',
                }),
            });
        });

        it('should include optional fields when provided', async () => {
            prismaMock.contextRagDocument.create.mockResolvedValue({ id: 'doc-456' });

            await repo.create({
                filename: 'test.pdf',
                fileHash: 'hash123',
                fileSize: 2048,
                pageCount: 10,
                totalBatches: 1,
                documentType: 'Medical',
                promptConfigId: 'config-123',
                experimentId: 'exp-v1',
                modelName: 'gemini-1.5-flash',
                modelConfig: { temperature: 0.3 },
            });

            expect(prismaMock.contextRagDocument.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    documentType: 'Medical',
                    promptConfigId: 'config-123',
                    experimentId: 'exp-v1',
                    modelName: 'gemini-1.5-flash',
                    modelConfig: { temperature: 0.3 },
                }),
            });
        });

        it('should throw DatabaseError on duplicate hash + experimentId', async () => {
            prismaMock.contextRagDocument.create.mockRejectedValue({ code: 'P2002' });

            await expect(
                repo.create({
                    filename: 'duplicate.pdf',
                    fileHash: 'existing-hash',
                    fileSize: 1024,
                    pageCount: 5,
                    totalBatches: 1,
                    experimentId: 'exp-1',
                })
            ).rejects.toThrow(DatabaseError);
        });

        it('should throw DatabaseError on generic database failure', async () => {
            prismaMock.contextRagDocument.create.mockRejectedValue(new Error('Connection failed'));

            await expect(
                repo.create({
                    filename: 'test.pdf',
                    fileHash: 'hash',
                    fileSize: 1024,
                    pageCount: 5,
                    totalBatches: 1,
                })
            ).rejects.toThrow(DatabaseError);
        });
    });

    // ========================================
    // GET BY ID
    // ========================================

    describe('getById', () => {
        it('should return document status when found', async () => {
            const mockDoc = createMockDocumentRecord({
                id: 'doc-123',
                filename: 'found.pdf',
                status: 'COMPLETED',
                pageCount: 20,
                totalBatches: 2,
                completedBatches: 2,
                failedBatches: 0,
            });
            prismaMock.contextRagDocument.findUnique.mockResolvedValue(mockDoc);

            const result = await repo.getById('doc-123');

            expect(result.id).toBe('doc-123');
            expect(result.filename).toBe('found.pdf');
            expect(result.status).toBe('COMPLETED');
            expect(result.progress.percentage).toBe(100);
        });

        it('should calculate progress percentage correctly', async () => {
            const mockDoc = createMockDocumentRecord({
                totalBatches: 4,
                completedBatches: 1,
                failedBatches: 0,
            });
            prismaMock.contextRagDocument.findUnique.mockResolvedValue(mockDoc);

            const result = await repo.getById('doc-123');

            expect(result.progress.percentage).toBe(25);
        });

        it('should throw NotFoundError when document not found', async () => {
            prismaMock.contextRagDocument.findUnique.mockResolvedValue(null);

            await expect(repo.getById('non-existent-id')).rejects.toThrow(NotFoundError);
            await expect(repo.getById('non-existent-id')).rejects.toThrow('Document not found');
        });
    });

    // ========================================
    // GET BY HASH
    // ========================================

    describe('getByHash', () => {
        it('should return document when hash matches', async () => {
            const mockDoc = createMockDocumentRecord({ fileHash: 'abc123' });
            prismaMock.contextRagDocument.findFirst.mockResolvedValue(mockDoc);

            const result = await repo.getByHash('abc123');

            expect(result).not.toBeNull();
            expect(prismaMock.contextRagDocument.findFirst).toHaveBeenCalledWith({
                where: { fileHash: 'abc123' },
            });
        });

        it('should return null when hash not found', async () => {
            prismaMock.contextRagDocument.findFirst.mockResolvedValue(null);

            const result = await repo.getByHash('unknown-hash');

            expect(result).toBeNull();
        });
    });

    // ========================================
    // GET BY HASH AND EXPERIMENT
    // ========================================

    describe('getByHashAndExperiment', () => {
        it('should find document with matching hash and experimentId', async () => {
            const mockDoc = createMockDocumentRecord({
                fileHash: 'hash123',
                experimentId: 'exp-v1',
            });
            prismaMock.contextRagDocument.findFirst.mockResolvedValue(mockDoc);

            const result = await repo.getByHashAndExperiment('hash123', 'exp-v1');

            expect(result).not.toBeNull();
            expect(prismaMock.contextRagDocument.findFirst).toHaveBeenCalledWith({
                where: {
                    fileHash: 'hash123',
                    experimentId: 'exp-v1',
                },
            });
        });

        it('should use null for experimentId when not provided', async () => {
            prismaMock.contextRagDocument.findFirst.mockResolvedValue(null);

            await repo.getByHashAndExperiment('hash123');

            expect(prismaMock.contextRagDocument.findFirst).toHaveBeenCalledWith({
                where: {
                    fileHash: 'hash123',
                    experimentId: null,
                },
            });
        });

        it('should return null when no match found', async () => {
            prismaMock.contextRagDocument.findFirst.mockResolvedValue(null);

            const result = await repo.getByHashAndExperiment('hash123', 'exp-v2');

            expect(result).toBeNull();
        });
    });

    // ========================================
    // UPDATE
    // ========================================

    describe('update', () => {
        it('should update document with provided fields', async () => {
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            await repo.update('doc-123', {
                status: 'PROCESSING',
            });

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                data: { status: 'PROCESSING' },
            });
        });
    });

    // ========================================
    // INCREMENT OPERATIONS
    // ========================================

    describe('incrementCompleted', () => {
        it('should increment completedBatches by 1', async () => {
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            await repo.incrementCompleted('doc-123');

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                data: { completedBatches: { increment: 1 } },
            });
        });
    });

    describe('incrementFailed', () => {
        it('should increment failedBatches by 1', async () => {
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            await repo.incrementFailed('doc-456');

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-456' },
                data: { failedBatches: { increment: 1 } },
            });
        });
    });

    // ========================================
    // MARK COMPLETED
    // ========================================

    describe('markCompleted', () => {
        it('should set COMPLETED status when no failed batches', async () => {
            prismaMock.contextRagDocument.findUnique.mockResolvedValue({ failedBatches: 0 });
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            const tokenUsage = createMockTokenUsage();
            await repo.markCompleted('doc-123', tokenUsage, 5000);

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                data: expect.objectContaining({
                    status: 'COMPLETED',
                    tokenUsage,
                    processingMs: 5000,
                    completedAt: expect.any(Date),
                }),
            });
        });

        it('should set PARTIAL status when has failed batches', async () => {
            prismaMock.contextRagDocument.findUnique.mockResolvedValue({ failedBatches: 2 });
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            await repo.markCompleted('doc-123', { input: 100, output: 50, total: 150 }, 3000);

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                data: expect.objectContaining({
                    status: 'PARTIAL',
                }),
            });
        });
    });

    // ========================================
    // MARK FAILED
    // ========================================

    describe('markFailed', () => {
        it('should set FAILED status with error message', async () => {
            prismaMock.contextRagDocument.update.mockResolvedValue({});

            await repo.markFailed('doc-123', 'Processing error: timeout');

            expect(prismaMock.contextRagDocument.update).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                data: expect.objectContaining({
                    status: 'FAILED',
                    errorMessage: 'Processing error: timeout',
                    completedAt: expect.any(Date),
                }),
            });
        });
    });

    // ========================================
    // DELETE
    // ========================================

    describe('delete', () => {
        it('should delete document by ID', async () => {
            prismaMock.contextRagDocument.delete.mockResolvedValue({});

            await repo.delete('doc-to-delete');

            expect(prismaMock.contextRagDocument.delete).toHaveBeenCalledWith({
                where: { id: 'doc-to-delete' },
            });
        });
    });

    // ========================================
    // GET BY STATUS
    // ========================================

    describe('getByStatus', () => {
        it('should return documents with matching status', async () => {
            const mockDocs = [
                createMockDocumentRecord({ status: 'PROCESSING' }),
                createMockDocumentRecord({ status: 'PROCESSING' }),
            ];
            prismaMock.contextRagDocument.findMany.mockResolvedValue(mockDocs);

            const results = await repo.getByStatus('PROCESSING');

            expect(results).toHaveLength(2);
            expect(prismaMock.contextRagDocument.findMany).toHaveBeenCalledWith({
                where: { status: 'PROCESSING' },
                orderBy: { createdAt: 'desc' },
            });
        });

        it('should return empty array when no documents match', async () => {
            prismaMock.contextRagDocument.findMany.mockResolvedValue([]);

            const results = await repo.getByStatus('DISCOVERING');

            expect(results).toHaveLength(0);
        });
    });
});
