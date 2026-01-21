/**
 * Mock Prisma Client
 * 
 * Type-safe deep mock for Prisma operations.
 * Uses vitest-mock-extended for automatic mock generation.
 */

import { beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClientLike } from '../../src/types/config.types.js';

// Type-safe deep mock
export type MockPrismaClient = DeepMockProxy<PrismaClientLike>;

// Create mock instance
export const prismaMock: MockPrismaClient = mockDeep<PrismaClientLike>();

/**
 * Reset all mock calls between tests
 */
export function resetPrismaMock(): void {
    mockReset(prismaMock);
}

/**
 * Setup common mock return values
 */
export function setupPrismaDefaults(): void {
    // Default empty arrays for findMany
    prismaMock.contextRagChunk.findMany.mockResolvedValue([]);
    prismaMock.contextRagDocument.findMany.mockResolvedValue([]);
    prismaMock.contextRagBatch.findMany.mockResolvedValue([]);
    prismaMock.contextRagPromptConfig.findMany.mockResolvedValue([]);

    // Default counts
    prismaMock.contextRagChunk.count.mockResolvedValue(0);
    prismaMock.contextRagDocument.count.mockResolvedValue(0);
    prismaMock.contextRagBatch.count.mockResolvedValue(0);
    prismaMock.contextRagPromptConfig.count.mockResolvedValue(0);
}

/**
 * Auto-reset before each test (use in setup.ts)
 */
export function setupPrismaMockReset(): void {
    beforeEach(() => {
        resetPrismaMock();
        setupPrismaDefaults();
    });
}
