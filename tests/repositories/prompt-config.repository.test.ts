/**
 * Prompt Config Repository Tests
 * 
 * Tests for PromptConfigRepository operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptConfigRepository } from '../../src/database/repositories/prompt-config.repository.js';
import { prismaMock } from '../mocks/prisma.mock.js';
import { createMockPromptConfigRecord } from '../mocks/fixtures.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('PromptConfigRepository', () => {
    let repo: PromptConfigRepository;

    beforeEach(() => {
        repo = new PromptConfigRepository(prismaMock);
    });

    // ========================================
    // CREATE
    // ========================================

    describe('create', () => {
        it('should create new prompt config with version 1', async () => {
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(null);
            prismaMock.contextRagPromptConfig.create.mockResolvedValue(
                createMockPromptConfigRecord({ version: 1 })
            );

            const result = await repo.create({
                documentType: 'Medical',
                name: 'Medical Extraction',
                systemPrompt: 'Extract medical terms...',
                chunkStrategy: {
                    maxTokens: 800,
                    overlapTokens: 50,
                    splitBy: 'semantic',
                    preserveTables: true,
                    preserveLists: true,
                },
            });

            expect(result.version).toBe(1);
            expect(prismaMock.contextRagPromptConfig.create).toHaveBeenCalled();
        });

        it('should increment version for existing document type', async () => {
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(
                createMockPromptConfigRecord({ version: 3 })
            );
            prismaMock.contextRagPromptConfig.create.mockResolvedValue(
                createMockPromptConfigRecord({ version: 4 })
            );

            const result = await repo.create({
                documentType: 'Legal',
                name: 'Legal v4',
                systemPrompt: 'Updated prompts...',
                chunkStrategy: {
                    maxTokens: 1000,
                    overlapTokens: 100,
                    splitBy: 'section',
                },
            });

            expect(result.version).toBe(4);
        });

        it('should set as default when setAsDefault is true', async () => {
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(null);
            prismaMock.contextRagPromptConfig.updateMany.mockResolvedValue({ count: 1 });
            prismaMock.contextRagPromptConfig.create.mockResolvedValue(
                createMockPromptConfigRecord({ isDefault: true })
            );

            const result = await repo.create({
                documentType: 'Technical',
                name: 'Tech Default',
                systemPrompt: 'Extract code...',
                chunkStrategy: { maxTokens: 500, overlapTokens: 25, splitBy: 'paragraph' },
                setAsDefault: true,
            });

            expect(result.isDefault).toBe(true);
            // Should have deactivated other defaults first
            expect(prismaMock.contextRagPromptConfig.updateMany).toHaveBeenCalled();
        });

        it('should store changeLog (createdBy is always manual)', async () => {
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(null);
            prismaMock.contextRagPromptConfig.create.mockResolvedValue(
                createMockPromptConfigRecord()
            );

            await repo.create({
                documentType: 'General',
                name: 'Config',
                systemPrompt: 'Prompt',
                chunkStrategy: { maxTokens: 500, overlapTokens: 50, splitBy: 'semantic' },
                changeLog: 'Initial version',
            });

            expect(prismaMock.contextRagPromptConfig.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    changeLog: 'Initial version',
                    createdBy: 'manual', // Implementation always sets 'manual'
                }),
            });
        });
    });

    // ========================================
    // GET BY ID
    // ========================================

    describe('getById', () => {
        it('should return prompt config when found', async () => {
            const mockConfig = createMockPromptConfigRecord({ id: 'config-123' });
            prismaMock.contextRagPromptConfig.findUnique.mockResolvedValue(mockConfig);

            const result = await repo.getById('config-123');

            expect(result.id).toBe('config-123');
        });

        it('should throw NotFoundError when not found', async () => {
            prismaMock.contextRagPromptConfig.findUnique.mockResolvedValue(null);

            await expect(repo.getById('non-existent')).rejects.toThrow(NotFoundError);
        });
    });

    // ========================================
    // GET DEFAULT
    // ========================================

    describe('getDefault', () => {
        it('should return default config for document type', async () => {
            const mockConfig = createMockPromptConfigRecord({
                documentType: 'Medical',
                isDefault: true,
            });
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(mockConfig);

            const result = await repo.getDefault('Medical');

            expect(result).not.toBeNull();
            expect(result?.documentType).toBe('Medical');
            expect(prismaMock.contextRagPromptConfig.findFirst).toHaveBeenCalledWith({
                where: {
                    documentType: 'Medical',
                    isDefault: true,
                    isActive: true,
                },
            });
        });

        it('should return null when no default exists', async () => {
            prismaMock.contextRagPromptConfig.findFirst.mockResolvedValue(null);

            const result = await repo.getDefault('Unknown');

            expect(result).toBeNull();
        });
    });

    // ========================================
    // GET MANY
    // ========================================

    describe('getMany', () => {
        it('should return all configs when no filters', async () => {
            const mockConfigs = [
                createMockPromptConfigRecord(),
                createMockPromptConfigRecord(),
            ];
            prismaMock.contextRagPromptConfig.findMany.mockResolvedValue(mockConfigs);

            const results = await repo.getMany();

            expect(results).toHaveLength(2);
        });

        it('should filter by documentType', async () => {
            prismaMock.contextRagPromptConfig.findMany.mockResolvedValue([]);

            await repo.getMany({ documentType: 'Legal' });

            expect(prismaMock.contextRagPromptConfig.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        documentType: 'Legal',
                    }),
                })
            );
        });

        it('should filter by activeOnly', async () => {
            prismaMock.contextRagPromptConfig.findMany.mockResolvedValue([]);

            await repo.getMany({ activeOnly: true }); // Note: filter is 'activeOnly', not 'isActive'

            expect(prismaMock.contextRagPromptConfig.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        isActive: true,
                    }),
                })
            );
        });
    });

    // ========================================
    // ACTIVATE
    // ========================================

    describe('activate', () => {
        it('should set config as default and deactivate others', async () => {
            const mockConfig = createMockPromptConfigRecord({
                id: 'config-to-activate',
                documentType: 'Technical',
            });
            prismaMock.contextRagPromptConfig.findUnique.mockResolvedValue(mockConfig);
            prismaMock.contextRagPromptConfig.updateMany.mockResolvedValue({ count: 1 });
            prismaMock.contextRagPromptConfig.update.mockResolvedValue({});

            await repo.activate('config-to-activate');

            // Should deactivate other versions of same type (excluding current)
            expect(prismaMock.contextRagPromptConfig.updateMany).toHaveBeenCalledWith({
                where: {
                    documentType: 'Technical',
                    id: { not: 'config-to-activate' },
                },
                data: { isActive: false, isDefault: false },
            });

            // Should activate the specified config
            expect(prismaMock.contextRagPromptConfig.update).toHaveBeenCalledWith({
                where: { id: 'config-to-activate' },
                data: { isActive: true, isDefault: true },
            });
        });

        it('should throw NotFoundError when config not found', async () => {
            prismaMock.contextRagPromptConfig.findUnique.mockResolvedValue(null);

            await expect(repo.activate('non-existent')).rejects.toThrow(NotFoundError);
        });
    });
});
