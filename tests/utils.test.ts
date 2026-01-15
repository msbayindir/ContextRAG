import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../src/utils/rate-limiter.js';
import { sleep, isRetryableError } from '../src/utils/retry.js';
import { hashBuffer, shortHash } from '../src/utils/hash.js';
import { createLogger, generateCorrelationId } from '../src/utils/logger.js';
import { createEventEmitter } from '../src/utils/events.js';
import { RateLimitError } from '../src/errors/index.js';

describe('Utilities', () => {
    describe('RateLimiter', () => {
        it('should create with default config', () => {
            const limiter = new RateLimiter({ requestsPerMinute: 60, adaptive: true });
            expect(limiter).toBeDefined();
        });

        it('should acquire tokens', async () => {
            const limiter = new RateLimiter({ requestsPerMinute: 1000, adaptive: false });
            await expect(limiter.acquire()).resolves.toBeUndefined();
        });

        it('should report success', () => {
            const limiter = new RateLimiter({ requestsPerMinute: 60, adaptive: true });
            expect(() => limiter.reportSuccess()).not.toThrow();
        });

        it('should report rate limit error', () => {
            const limiter = new RateLimiter({ requestsPerMinute: 60, adaptive: true });
            expect(() => limiter.reportRateLimitError()).not.toThrow();
        });
    });

    describe('Retry helpers', () => {
        it('should sleep for specified duration', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(45);
        });

        it('should identify RateLimitError as retryable', () => {
            const error = new RateLimitError('Rate limited');
            expect(isRetryableError(error)).toBe(true);
        });

        it('should identify retryable errors with patterns', () => {
            const patterns = ['429', '503', 'TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'];

            expect(isRetryableError(new Error('Error 429 Too Many Requests'), patterns)).toBe(true);
            expect(isRetryableError(new Error('Service Unavailable 503'), patterns)).toBe(true);
            expect(isRetryableError(new Error('TIMEOUT exceeded'), patterns)).toBe(true);
            expect(isRetryableError(new Error('ECONNRESET'), patterns)).toBe(true);
            expect(isRetryableError(new Error('ETIMEDOUT'), patterns)).toBe(true);
        });

        it('should identify non-retryable errors', () => {
            expect(isRetryableError(new Error('Invalid input'))).toBe(false);
            expect(isRetryableError(new Error('Not found'))).toBe(false);
        });
    });

    describe('Hash utilities', () => {
        it('should hash buffer consistently', () => {
            const buffer = Buffer.from('test content');
            const hash1 = hashBuffer(buffer);
            const hash2 = hashBuffer(buffer);
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different content', () => {
            const hash1 = hashBuffer(Buffer.from('content 1'));
            const hash2 = hashBuffer(Buffer.from('content 2'));
            expect(hash1).not.toBe(hash2);
        });

        it('should create short hash', () => {
            const full = hashBuffer(Buffer.from('test'));
            const short = shortHash(full);
            expect(short.length).toBe(8);
            expect(full.startsWith(short)).toBe(true);
        });
    });

    describe('Logger', () => {
        it('should create logger with config', () => {
            const logger = createLogger({ level: 'info', structured: true });
            expect(logger).toBeDefined();
            expect(logger.info).toBeDefined();
            expect(logger.warn).toBeDefined();
            expect(logger.error).toBeDefined();
            expect(logger.debug).toBeDefined();
        });

        it('should generate correlation IDs', () => {
            const id1 = generateCorrelationId();
            const id2 = generateCorrelationId();
            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
        });
    });

    describe('EventEmitter', () => {
        it('should create event emitter', () => {
            const emitter = createEventEmitter();
            expect(emitter).toBeDefined();
            expect(emitter.on).toBeDefined();
            expect(emitter.emit).toBeDefined();
        });

        it('should emit and receive events', () => {
            const emitter = createEventEmitter();
            const handler = vi.fn();

            emitter.on('ingest:start', handler);
            emitter.emit('ingest:start', {
                documentId: 'test-id',
                filename: 'test.pdf',
                pageCount: 10,
            });

            expect(handler).toHaveBeenCalledWith({
                documentId: 'test-id',
                filename: 'test.pdf',
                pageCount: 10,
            });
        });

        it('should support once listener', () => {
            const emitter = createEventEmitter();
            const handler = vi.fn();

            emitter.once('search:start', handler);
            emitter.emit('search:start', { query: 'test', correlationId: '123' });
            emitter.emit('search:start', { query: 'test2', correlationId: '456' });

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should remove listeners with off', () => {
            const emitter = createEventEmitter();
            const handler = vi.fn();

            emitter.on('health:check', handler);
            emitter.off('health:check', handler);
            emitter.emit('health:check', { status: 'healthy' });

            expect(handler).not.toHaveBeenCalled();
        });
    });
});
