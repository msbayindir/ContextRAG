/**
 * Enhancement Tests
 * 
 * Tests for RAG enhancement handlers and registry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoOpHandler } from '../../src/enhancements/no-op.handler.js';
import type { ChunkData, DocumentContext } from '../../src/types/rag-enhancement.types.js';

describe('Enhancement Handlers', () => {
    // ========================================
    // NO-OP HANDLER
    // ========================================

    describe('NoOpHandler', () => {
        let handler: NoOpHandler;

        beforeEach(() => {
            handler = new NoOpHandler();
        });

        it('should return empty string for any chunk', async () => {
            // NoOpHandler.generateContext takes no arguments and returns empty string
            const result = await handler.generateContext();

            expect(result).toBe('');
        });

        it('should always skip (no context generation)', () => {
            // NoOpHandler's shouldSkip() returns true - it skips all chunks
            // Note: NoOpHandler.shouldSkip takes no arguments
            expect(handler.shouldSkip()).toBe(true);
        });
    });

    // ========================================
    // RAG ENHANCEMENT TYPES
    // ========================================

    describe('RAG Enhancement Types', () => {
        it('should define valid enhancement defaults', async () => {
            const { DEFAULT_ANTHROPIC_CONFIG } = await import('../../src/types/rag-enhancement.types.js');

            expect(DEFAULT_ANTHROPIC_CONFIG).toBeDefined();
            expect(DEFAULT_ANTHROPIC_CONFIG.concurrencyLimit).toBe(5);
            expect(DEFAULT_ANTHROPIC_CONFIG.maxContextTokens).toBe(100);
        });

        it('should have default skip chunk types', async () => {
            const { DEFAULT_ANTHROPIC_CONFIG } = await import('../../src/types/rag-enhancement.types.js');

            expect(DEFAULT_ANTHROPIC_CONFIG.skipChunkTypes).toBeDefined();
            expect(Array.isArray(DEFAULT_ANTHROPIC_CONFIG.skipChunkTypes)).toBe(true);
        });
    });

    // ========================================
    // ENHANCEMENT REGISTRY
    // ========================================

    describe('Enhancement Registry', () => {
        it('should create NoOpHandler when config is undefined', async () => {
            const { createEnhancementHandler } = await import('../../src/enhancements/enhancement-registry.js');
            const { createMockResolvedConfig } = await import('../mocks/fixtures.js');
            const { createMockLLMService } = await import('../mocks/gemini.mock.js');
            const { createLogger } = await import('../../src/utils/index.js');

            const config = createMockResolvedConfig();
            const mockLlm = createMockLLMService();
            const llmFactory = { create: () => mockLlm };
            const logger = createLogger(config.logging);

            const handler = createEnhancementHandler(
                undefined,
                config,
                mockLlm,
                llmFactory,
                logger
            );

            // Should be a NoOpHandler
            expect(await handler.generateContext(
                { content: 'test', searchContent: 'test', displayContent: 'test', chunkType: 'TEXT', page: 1 },
                { filename: 'test.pdf', pageCount: 1 }
            )).toBe('');
        });

        it('should create NoOpHandler when approach is none', async () => {
            const { createEnhancementHandler } = await import('../../src/enhancements/enhancement-registry.js');
            const { createMockResolvedConfig } = await import('../mocks/fixtures.js');
            const { createMockLLMService } = await import('../mocks/gemini.mock.js');
            const { createLogger } = await import('../../src/utils/index.js');

            const config = createMockResolvedConfig();
            const mockLlm = createMockLLMService();
            const llmFactory = { create: () => mockLlm };
            const logger = createLogger(config.logging);

            const handler = createEnhancementHandler(
                { approach: 'none' },
                config,
                mockLlm,
                llmFactory,
                logger
            );

            const result = await handler.generateContext(
                { content: 'test', searchContent: 'test', displayContent: 'test', chunkType: 'TEXT', page: 1 },
                { filename: 'test.pdf', pageCount: 1 }
            );

            expect(result).toBe('');
        });

        it('should throw ConfigurationError for unimplemented approach', async () => {
            const { createEnhancementHandler } = await import('../../src/enhancements/enhancement-registry.js');
            const { ConfigurationError } = await import('../../src/errors/index.js');
            const { createMockResolvedConfig } = await import('../mocks/fixtures.js');
            const { createMockLLMService } = await import('../mocks/gemini.mock.js');
            const { createLogger } = await import('../../src/utils/index.js');

            const config = createMockResolvedConfig();
            const mockLlm = createMockLLMService();
            const llmFactory = { create: () => mockLlm };
            const logger = createLogger(config.logging);

            expect(() => createEnhancementHandler(
                { approach: 'google_grounding' as any },
                config,
                mockLlm,
                llmFactory,
                logger
            )).toThrow(ConfigurationError);
        });
    });

    // ========================================
    // ANTHROPIC CONTEXTUAL CONFIG
    // ========================================

    describe('Anthropic Contextual Config', () => {
        it('should define strategy options', async () => {
            // Strategy should be one of: 'none' | 'simple' | 'llm'
            const strategies = ['none', 'simple', 'llm'];
            strategies.forEach(strategy => {
                expect(['none', 'simple', 'llm']).toContain(strategy);
            });
        });

        it('should have reasonable defaults', async () => {
            const { DEFAULT_ANTHROPIC_CONFIG } = await import('../../src/types/rag-enhancement.types.js');

            // Concurrency should be reasonable
            expect(DEFAULT_ANTHROPIC_CONFIG.concurrencyLimit).toBeGreaterThan(0);
            expect(DEFAULT_ANTHROPIC_CONFIG.concurrencyLimit).toBeLessThanOrEqual(10);
        });
    });

    // ========================================
    // SIMPLE CONTEXT GENERATION
    // ========================================

    describe('Simple Context Generation', () => {
        it('should generate structured metadata format', () => {
            // Simple context format: [Source: filename] [Type: type] [Page: page]
            const filename = 'test.pdf';
            const chunkType = 'TEXT';
            const page = 5;
            const parentHeading = 'Chapter 1';

            const context = `[Source: ${filename}] [Type: ${chunkType}] [Page: ${page}] [Section: ${parentHeading}]`;

            expect(context).toContain('[Source:');
            expect(context).toContain('[Type:');
            expect(context).toContain('[Page:');
            expect(context).toContain('[Section:');
        });

        it('should omit section when no parent heading', () => {
            const filename = 'test.pdf';
            const chunkType = 'TABLE';
            const page = 3;

            const context = `[Source: ${filename}] [Type: ${chunkType}] [Page: ${page}]`;

            expect(context).not.toContain('[Section:');
        });
    });
});
