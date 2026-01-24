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
import { ConfigurationError } from '../errors/index.js';

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
     * Cohere API key for reranking and embeddings (optional)
     * Get yours at: https://dashboard.cohere.com/api-keys
     */
    COHERE_API_KEY: z
        .string()
        .optional()
        .describe('Cohere API key for reranking and embeddings'),

    /**
     * OpenAI API key for embeddings and LLM usage (optional)
     * Get yours at: https://platform.openai.com/api-keys
     */
    OPENAI_API_KEY: z
        .string()
        .optional()
        .describe('OpenAI API key for embeddings'),

    /**
     * Anthropic API key for LLM (optional)
     * Get yours at: https://console.anthropic.com/settings/keys
     */
    ANTHROPIC_API_KEY: z
        .string()
        .optional()
        .describe('Anthropic API key for LLM usage'),
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

        throw new ConfigurationError(`Environment validation failed:\n${errors}`);
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
    openaiConfigured: boolean;
    anthropicConfigured: boolean;
} {
    return {
        logLevel: env.LOG_LEVEL,
        cohereConfigured: hasEnv('COHERE_API_KEY'),
        openaiConfigured: hasEnv('OPENAI_API_KEY'),
        anthropicConfigured: hasEnv('ANTHROPIC_API_KEY'),
    };
}
