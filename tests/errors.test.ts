import { describe, it, expect } from 'vitest';
import {
    ContextRAGError,
    ConfigurationError,
    IngestionError,
    SearchError,
    DiscoveryError,
    DatabaseError,
    RateLimitError,
    ValidationError,
    NotFoundError,
} from '../src/errors/index.js';

describe('Error Classes', () => {
    describe('ContextRAGError', () => {
        it('should create with message', () => {
            const error = new ContextRAGError('Test error', 'TEST_CODE');
            expect(error.message).toBe('Test error');
            expect(error.name).toBe('ContextRAGError');
        });

        it('should create with code', () => {
            const error = new ContextRAGError('Test error', 'TEST_CODE');
            expect(error.code).toBe('TEST_CODE');
        });

        it('should create with details', () => {
            const error = new ContextRAGError('Test error', 'TEST', { key: 'value' });
            expect(error.details).toEqual({ key: 'value' });
        });

        it('should serialize to JSON', () => {
            const error = new ContextRAGError('Test error', 'TEST', { key: 'value' });
            const json = error.toJSON();
            expect(json.name).toBe('ContextRAGError');
            expect(json.code).toBe('TEST');
            expect(json.message).toBe('Test error');
            expect(json.details).toEqual({ key: 'value' });
        });
    });

    describe('ConfigurationError', () => {
        it('should have correct name and code', () => {
            const error = new ConfigurationError('Invalid config');
            expect(error.name).toBe('ConfigurationError');
            expect(error.code).toBe('CONFIGURATION_ERROR');
        });
    });

    describe('IngestionError', () => {
        it('should have correct name and code', () => {
            const error = new IngestionError('Ingestion failed');
            expect(error.name).toBe('IngestionError');
            expect(error.code).toBe('INGESTION_ERROR');
        });

        it('should store batchIndex', () => {
            const error = new IngestionError('Batch failed', { batchIndex: 5 });
            expect(error.batchIndex).toBe(5);
        });

        it('should store retryable flag', () => {
            const error = new IngestionError('Retry me', { retryable: true });
            expect(error.retryable).toBe(true);
        });
    });

    describe('SearchError', () => {
        it('should have correct name and code', () => {
            const error = new SearchError('Search failed');
            expect(error.name).toBe('SearchError');
            expect(error.code).toBe('SEARCH_ERROR');
        });
    });

    describe('DiscoveryError', () => {
        it('should have correct name and code', () => {
            const error = new DiscoveryError('Discovery failed');
            expect(error.name).toBe('DiscoveryError');
            expect(error.code).toBe('DISCOVERY_ERROR');
        });
    });

    describe('DatabaseError', () => {
        it('should have correct name and code', () => {
            const error = new DatabaseError('DB connection failed');
            expect(error.name).toBe('DatabaseError');
            expect(error.code).toBe('DATABASE_ERROR');
        });
    });

    describe('RateLimitError', () => {
        it('should have correct name and code', () => {
            const error = new RateLimitError('Rate limited');
            expect(error.name).toBe('RateLimitError');
            expect(error.code).toBe('RATE_LIMIT_ERROR');
        });

        it('should store retryAfterMs', () => {
            const error = new RateLimitError('Rate limited', 30000);
            expect(error.retryAfterMs).toBe(30000);
        });
    });

    describe('ValidationError', () => {
        it('should have correct name and code', () => {
            const error = new ValidationError('Invalid input');
            expect(error.name).toBe('ValidationError');
            expect(error.code).toBe('VALIDATION_ERROR');
        });

        it('should store field name', () => {
            const error = new ValidationError('Invalid email', 'email');
            expect(error.field).toBe('email');
        });
    });

    describe('NotFoundError', () => {
        it('should have correct name and code', () => {
            const error = new NotFoundError('Document', '123');
            expect(error.name).toBe('NotFoundError');
            expect(error.code).toBe('NOT_FOUND');
        });

        it('should format message correctly', () => {
            const error = new NotFoundError('Document', '123');
            expect(error.message).toBe('Document not found: 123');
        });

        it('should store resource info', () => {
            const error = new NotFoundError('PromptConfig', 'abc');
            expect(error.resourceType).toBe('PromptConfig');
            expect(error.resourceId).toBe('abc');
        });
    });
});
