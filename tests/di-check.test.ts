
import { describe, it, expect, vi } from 'vitest';
import { ContextRAGFactory, createContextRAG } from '../src/context-rag.factory';
import { ContextRAG } from '../src/context-rag';
import { PrismaClient } from '@prisma/client';
import { IngestionEngine } from '../src/engines/ingestion.engine';
import { RetrievalEngine } from '../src/engines/retrieval.engine';
import { DiscoveryEngine } from '../src/engines/discovery.engine';

// Mock Prisma to avoid DB connection errors during quick check
vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(),
}));

describe('Dependency Injection Verification', () => {
    const mockConfig = {
        prisma: new PrismaClient(),
        geminiApiKey: 'test-key',
    };

    it('should create instance using Factory.create()', () => {
        const rag = ContextRAGFactory.create(mockConfig);
        expect(rag).toBeInstanceOf(ContextRAG);
    });

    it('should create instance using createContextRAG()', () => {
        const rag = createContextRAG(mockConfig);
        expect(rag).toBeInstanceOf(ContextRAG);
    });

    it('should accept injected dependencies with proper structure', () => {
        // Create mock dependencies with proper structure
        const mockIngestionEngine = {} as IngestionEngine;
        const mockRetrievalEngine = {} as RetrievalEngine;
        const mockDiscoveryEngine = {} as DiscoveryEngine;
        const mockRepos = {
            promptConfig: { findById: vi.fn(), findActive: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), activate: vi.fn() },
            document: { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
            chunk: { createMany: vi.fn(), findByDocument: vi.fn(), findByIds: vi.fn(), searchByVector: vi.fn(), deleteByDocument: vi.fn(), countByDocument: vi.fn() },
        };

        const rag = new ContextRAG(mockConfig, {
            ingestionEngine: mockIngestionEngine,
            retrievalEngine: mockRetrievalEngine,
            discoveryEngine: mockDiscoveryEngine,
            repos: mockRepos as any,
        });
        expect(rag).toBeInstanceOf(ContextRAG);
    });
});
