import type { BatchConfig } from '../types/config.types.js';
import { RateLimitError } from '../errors/index.js';

export interface RetryOptions {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Default retry options from batch config
 */
export function getRetryOptions(batchConfig: BatchConfig): RetryOptions {
    return {
        maxRetries: batchConfig.maxRetries,
        initialDelayMs: batchConfig.retryDelayMs,
        maxDelayMs: 30000,
        backoffMultiplier: batchConfig.backoffMultiplier,
        retryableErrors: ['429', '503', 'TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'],
    };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error, retryableErrors: string[] = []): boolean {
    const errorString = error.message + (error.name || '');

    // Rate limit errors are always retryable
    if (error instanceof RateLimitError) {
        return true;
    }

    // Check against retryable error patterns
    return retryableErrors.some(pattern =>
        errorString.includes(pattern) || error.name.includes(pattern)
    );
}

/**
 * Calculate delay with exponential backoff
 */
export function calculateBackoffDelay(
    attempt: number,
    initialDelayMs: number,
    backoffMultiplier: number,
    maxDelayMs: number
): number {
    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Check if we should retry
            if (attempt > options.maxRetries) {
                break;
            }

            if (!isRetryableError(lastError, options.retryableErrors)) {
                throw lastError;
            }

            // Calculate delay
            let delayMs = calculateBackoffDelay(
                attempt,
                options.initialDelayMs,
                options.backoffMultiplier,
                options.maxDelayMs
            );

            // Use retry-after header if available
            if (lastError instanceof RateLimitError && lastError.retryAfterMs) {
                delayMs = Math.max(delayMs, lastError.retryAfterMs);
            }

            // Notify about retry
            options.onRetry?.(attempt, lastError, delayMs);

            // Wait before retrying
            await sleep(delayMs);
        }
    }

    throw lastError;
}
