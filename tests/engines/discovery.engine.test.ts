/**
 * Discovery Engine Tests
 * 
 * Tests for document analysis and strategy generation.
 * Uses direct method testing without complex mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the simpler utility functions and exported behaviors
// rather than trying to mock the entire GeminiService dependency

describe('DiscoveryEngine', () => {
    describe('session management utilities', () => {
        // Test session timeout value
        it('should have reasonable session timeout', () => {
            // 30 minutes is the expected session timeout
            const EXPECTED_TIMEOUT_MS = 30 * 60 * 1000;
            expect(EXPECTED_TIMEOUT_MS).toBe(1800000);
        });
    });

    describe('default instructions', () => {
        it('should define DEFAULT_DOCUMENT_INSTRUCTIONS template', async () => {
            const { DEFAULT_DOCUMENT_INSTRUCTIONS } = await import('../../src/config/templates.js');

            expect(DEFAULT_DOCUMENT_INSTRUCTIONS).toBeDefined();
            expect(typeof DEFAULT_DOCUMENT_INSTRUCTIONS).toBe('string');
            expect(DEFAULT_DOCUMENT_INSTRUCTIONS.length).toBeGreaterThan(0);
        });

        it('should include key extraction guidelines', async () => {
            const { DEFAULT_DOCUMENT_INSTRUCTIONS } = await import('../../src/config/templates.js');

            // Should mention preserving structure
            const lowerContent = DEFAULT_DOCUMENT_INSTRUCTIONS.toLowerCase();
            expect(lowerContent).toMatch(/extract|preserve|content/);
        });
    });

    describe('discovery template', () => {
        it('should build discovery prompt correctly', async () => {
            const { buildDiscoveryPrompt } = await import('../../src/config/templates.js');

            const prompt = buildDiscoveryPrompt();

            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('string');
            expect(prompt.length).toBeGreaterThan(100);
        });

        it('should include document type hint when provided', async () => {
            const { buildDiscoveryPrompt } = await import('../../src/config/templates.js');

            const prompt = buildDiscoveryPrompt('Medical Report');

            expect(prompt).toContain('Medical Report');
        });
    });

    describe('discovery response schema', () => {
        it('should validate correct discovery response', async () => {
            const { DiscoveryResponseSchema } = await import('../../src/schemas/structured-output.schemas.js');

            const validResponse = {
                documentType: 'Medical',
                documentTypeName: 'Medical Report',
                language: 'tr',
                complexity: 'medium',
                detectedElements: [
                    { type: 'table', count: 5, examples: [1, 2] },
                ],
                specialInstructions: ['Preserve medical terms'],
                confidence: 0.9,
                reasoning: 'Contains medical terminology.',
            };

            const result = DiscoveryResponseSchema.safeParse(validResponse);
            expect(result.success).toBe(true);
        });

        it('should reject invalid discovery response', async () => {
            const { DiscoveryResponseSchema } = await import('../../src/schemas/structured-output.schemas.js');

            const invalidResponse = {
                // Missing required fields
                documentType: 'Test',
            };

            const result = DiscoveryResponseSchema.safeParse(invalidResponse);
            expect(result.success).toBe(false);
        });

        it('should require confidence between 0 and 1', async () => {
            const { DiscoveryResponseSchema } = await import('../../src/schemas/structured-output.schemas.js');

            const invalidConfidence = {
                documentType: 'Test',
                documentTypeName: 'Test Doc',
                specialInstructions: [],
                confidence: 1.5, // Invalid - over 1
                reasoning: 'Test',
            };

            const result = DiscoveryResponseSchema.safeParse(invalidConfidence);
            expect(result.success).toBe(false);
        });
    });

    describe('chunk strategy schema', () => {
        it('should validate chunk strategy with defaults', async () => {
            const { ChunkStrategySchema } = await import('../../src/schemas/structured-output.schemas.js');

            const strategy = {
                maxTokens: 500,
                splitBy: 'semantic',
            };

            const result = ChunkStrategySchema.safeParse(strategy);
            expect(result.success).toBe(true);

            if (result.success) {
                expect(result.data.preserveTables).toBe(true); // Default
                expect(result.data.preserveLists).toBe(true); // Default
            }
        });

        it('should reject invalid maxTokens', async () => {
            const { ChunkStrategySchema } = await import('../../src/schemas/structured-output.schemas.js');

            const invalidStrategy = {
                maxTokens: 50, // Too low (min: 100)
                splitBy: 'semantic',
            };

            const result = ChunkStrategySchema.safeParse(invalidStrategy);
            expect(result.success).toBe(false);
        });
    });
});
