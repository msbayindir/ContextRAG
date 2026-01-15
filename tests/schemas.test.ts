import { describe, it, expect } from 'vitest';
import {
    ingestOptionsSchema,
    searchOptionsSchema,
    discoveryOptionsSchema,
    createPromptConfigSchema,
} from '../src/types/schemas.js';

describe('Validation Schemas', () => {
    describe('ingestOptionsSchema', () => {
        it('should validate with buffer file', () => {
            const result = ingestOptionsSchema.safeParse({
                file: Buffer.from('test'),
            });

            expect(result.success).toBe(true);
        });

        it('should validate with file path', () => {
            const result = ingestOptionsSchema.safeParse({
                file: '/path/to/file.pdf',
            });

            expect(result.success).toBe(true);
        });

        it('should validate with all options', () => {
            const result = ingestOptionsSchema.safeParse({
                file: Buffer.from('test'),
                filename: 'document.pdf',
                documentType: 'Medical',
                skipExisting: true,
            });

            expect(result.success).toBe(true);
        });
    });

    describe('searchOptionsSchema', () => {
        it('should validate minimal search options', () => {
            const result = searchOptionsSchema.safeParse({
                query: 'test query',
            });

            expect(result.success).toBe(true);
        });

        it('should reject empty query', () => {
            const result = searchOptionsSchema.safeParse({
                query: '',
            });

            expect(result.success).toBe(false);
        });

        it('should validate with full options', () => {
            const result = searchOptionsSchema.safeParse({
                query: 'test query',
                limit: 20,
                mode: 'hybrid',
                minScore: 0.5,
                filters: {
                    documentTypes: ['Medical', 'Legal'],
                    minConfidence: 0.8,
                },
                includeExplanation: true,
            });

            expect(result.success).toBe(true);
        });

        it('should reject limit over 100', () => {
            const result = searchOptionsSchema.safeParse({
                query: 'test query',
                limit: 150,
            });

            expect(result.success).toBe(false);
        });

        it('should reject invalid mode', () => {
            const result = searchOptionsSchema.safeParse({
                query: 'test query',
                mode: 'invalid',
            });

            expect(result.success).toBe(false);
        });
    });

    describe('discoveryOptionsSchema', () => {
        it('should validate with buffer', () => {
            const result = discoveryOptionsSchema.safeParse({
                file: Buffer.from('test'),
            });

            expect(result.success).toBe(true);
        });

        it('should validate with document type hint', () => {
            const result = discoveryOptionsSchema.safeParse({
                file: '/path/to/file.pdf',
                documentTypeHint: 'Medical',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('createPromptConfigSchema', () => {
        it('should validate minimal config', () => {
            const result = createPromptConfigSchema.safeParse({
                documentType: 'Medical',
                name: 'Medical Documents',
                systemPrompt: 'Process this medical document with care.',
            });

            expect(result.success).toBe(true);
        });

        it('should reject empty document type', () => {
            const result = createPromptConfigSchema.safeParse({
                documentType: '',
                name: 'Test',
                systemPrompt: 'Some prompt that is long enough',
            });

            expect(result.success).toBe(false);
        });

        it('should reject short system prompt', () => {
            const result = createPromptConfigSchema.safeParse({
                documentType: 'Test',
                name: 'Test',
                systemPrompt: 'Short',
            });

            expect(result.success).toBe(false);
        });

        it('should validate with full chunk strategy', () => {
            const result = createPromptConfigSchema.safeParse({
                documentType: 'Medical',
                name: 'Medical Documents',
                systemPrompt: 'Process this medical document with care.',
                chunkStrategy: {
                    maxTokens: 1000,
                    overlapTokens: 100,
                    splitBy: 'section',
                    preserveTables: true,
                    preserveLists: true,
                },
                setAsDefault: true,
                changeLog: 'Initial version',
            });

            expect(result.success).toBe(true);
        });
    });
});
