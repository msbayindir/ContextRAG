/**
 * Mock Logger
 * 
 * Silent logger for tests that captures log calls for assertions.
 */

import { vi } from 'vitest';
import type { Logger } from '../../src/utils/logger.js';

/**
 * Mock Logger type with spy functions
 */
export type MockLogger = {
    [K in keyof Logger]: ReturnType<typeof vi.fn>;
};

/**
 * Create a silent mock logger
 * All methods are no-ops but can be spied on
 */
export function createMockLogger(): MockLogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

/**
 * Create a logger that logs to console (for debugging tests)
 */
export function createVerboseMockLogger(): MockLogger {
    return {
        debug: vi.fn((...args) => console.log('[DEBUG]', ...args)),
        info: vi.fn((...args) => console.log('[INFO]', ...args)),
        warn: vi.fn((...args) => console.warn('[WARN]', ...args)),
        error: vi.fn((...args) => console.error('[ERROR]', ...args)),
    };
}
