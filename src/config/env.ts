/**
 * Centralized Environment Configuration
 *
 * Validates and exports all environment variables with Zod.
 * Import this module instead of accessing process.env directly.
 *
 * @example
 * ```typescript
 * import { env } from './config/env.js';
 * console.log(env.LOG_LEVEL); // Type-safe access
 * ```
 */

import { z } from 'zod';

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
    /**
     * Log level for the logger
     * @default 'info'
     */
    LOG_LEVEL: z
        .enum(['debug', 'info', 'warn', 'error'])
        .default('info')
        .describe('Log level: debug, info, warn, error'),

    /**
     * Cohere API key for reranking (optional)
     * Get yours at: https://dashboard.cohere.com/api-keys
     */
    COHERE_API_KEY: z
        .string()
        .optional()
        .describe('Cohere API key for reranking'),
});

/**
 * Validated environment type
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse environment variables with validation
 * Returns validated env object or throws with descriptive errors
 */
function parseEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formatted = result.error.format();
        const errors = Object.entries(formatted)
            .filter(([key]) => key !== '_errors')
            .map(([key, value]) => {
                const messages = (value as { _errors?: string[] })?._errors || [];
                return `  ${key}: ${messages.join(', ')}`;
            })
            .join('\n');

        throw new Error(`Environment validation failed:\n${errors}`);
    }

    return result.data;
}

/**
 * Validated environment variables
 * Use this instead of process.env for type-safe access
 */
export const env = parseEnv();

/**
 * Check if an optional env var is configured
 */
export function hasEnv(key: keyof Env): boolean {
    return env[key] !== undefined && env[key] !== '';
}

/**
 * Get environment info for health checks
 */
export function getEnvInfo(): {
    logLevel: string;
    cohereConfigured: boolean;
} {
    return {
        logLevel: env.LOG_LEVEL,
        cohereConfigured: hasEnv('COHERE_API_KEY'),
    };
}
