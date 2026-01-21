/**
 * Global Test Setup
 * 
 * Configures test environment and resets mocks between tests.
 */

import { beforeEach, vi } from 'vitest';
import { resetPrismaMock, setupPrismaDefaults } from './mocks/prisma.mock.js';

// ========================================
// MOCK RESET
// ========================================

beforeEach(() => {
    // Clear all vi.fn() mocks
    vi.clearAllMocks();

    // Reset Prisma mock
    resetPrismaMock();
    setupPrismaDefaults();
});

// ========================================
// CONSOLE SILENCING (optional)
// ========================================

// Uncomment to silence console output during tests
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'info').mockImplementation(() => {});
// vi.spyOn(console, 'debug').mockImplementation(() => {});

// ========================================
// GLOBAL TEST HELPERS
// ========================================

/**
 * Wait for a specific duration (useful for async tests)
 */
export async function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}
