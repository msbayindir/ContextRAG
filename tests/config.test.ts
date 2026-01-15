import { describe, it, expect } from 'vitest';
import {
    configSchema,
    DEFAULT_BATCH_CONFIG,
    DEFAULT_CHUNK_CONFIG,
    DEFAULT_RATE_LIMIT_CONFIG,
    DEFAULT_LOG_CONFIG,
} from '../src/types/config.types.js';

describe('Configuration Types', () => {
    describe('configSchema', () => {
        it('should validate minimal config', () => {
            const result = configSchema.safeParse({
                geminiApiKey: 'test-api-key',
            });

            expect(result.success).toBe(true);
        });

        it('should reject missing geminiApiKey', () => {
            const result = configSchema.safeParse({});

            expect(result.success).toBe(false);
        });

        it('should reject empty geminiApiKey', () => {
            const result = configSchema.safeParse({
                geminiApiKey: '',
            });

            expect(result.success).toBe(false);
        });

        it('should validate with all options', () => {
            const result = configSchema.safeParse({
                geminiApiKey: 'test-api-key',
                model: 'gemini-1.5-flash',
                batchConfig: {
                    pagesPerBatch: 20,
                    maxConcurrency: 5,
                },
                chunkConfig: {
                    maxTokens: 1000,
                },
                rateLimitConfig: {
                    requestsPerMinute: 100,
                },
                logging: {
                    level: 'debug',
                },
            });

            expect(result.success).toBe(true);
        });

        it('should reject invalid model', () => {
            const result = configSchema.safeParse({
                geminiApiKey: 'test-api-key',
                model: 'invalid-model',
            });

            expect(result.success).toBe(false);
        });

        it('should reject invalid batch config values', () => {
            const result = configSchema.safeParse({
                geminiApiKey: 'test-api-key',
                batchConfig: {
                    pagesPerBatch: 100, // max is 50
                },
            });

            expect(result.success).toBe(false);
        });
    });

    describe('Default Configs', () => {
        it('should have valid DEFAULT_BATCH_CONFIG', () => {
            expect(DEFAULT_BATCH_CONFIG.pagesPerBatch).toBe(15);
            expect(DEFAULT_BATCH_CONFIG.maxConcurrency).toBe(3);
            expect(DEFAULT_BATCH_CONFIG.maxRetries).toBe(3);
            expect(DEFAULT_BATCH_CONFIG.retryDelayMs).toBe(1000);
            expect(DEFAULT_BATCH_CONFIG.backoffMultiplier).toBe(2);
        });

        it('should have valid DEFAULT_CHUNK_CONFIG', () => {
            expect(DEFAULT_CHUNK_CONFIG.maxTokens).toBe(500);
            expect(DEFAULT_CHUNK_CONFIG.overlapTokens).toBe(50);
        });

        it('should have valid DEFAULT_RATE_LIMIT_CONFIG', () => {
            expect(DEFAULT_RATE_LIMIT_CONFIG.requestsPerMinute).toBe(60);
            expect(DEFAULT_RATE_LIMIT_CONFIG.adaptive).toBe(true);
        });

        it('should have valid DEFAULT_LOG_CONFIG', () => {
            expect(DEFAULT_LOG_CONFIG.level).toBe('info');
            expect(DEFAULT_LOG_CONFIG.structured).toBe(true);
        });
    });
});
