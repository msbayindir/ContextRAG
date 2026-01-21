/**
 * Embedding Provider Factory
 * 
 * Creates the appropriate embedding provider based on configuration.
 * Currently supports Gemini, with OpenAI and Cohere planned for Phase 3.
 */

import type { EmbeddingProvider, EmbeddingProviderConfig } from '../types/embedding-provider.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider.js';
import { CohereEmbeddingProvider } from './cohere-embedding.provider.js';
import { env } from '../config/env.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { Logger } from '../utils/logger.js';
import { ConfigurationError } from '../errors/index.js';

/**
 * Create an embedding provider based on configuration
 * 
 * @param config - Resolved Context-RAG configuration
 * @param rateLimiter - Rate limiter instance
 * @param logger - Logger instance
 * @param providerConfig - Optional provider-specific configuration
 * @returns Configured embedding provider
 */
export function createEmbeddingProvider(
    config: ResolvedConfig,
    rateLimiter: RateLimiter,
    logger: Logger,
    providerConfig?: EmbeddingProviderConfig
): EmbeddingProvider {
    // Determine which provider to use
    const provider = providerConfig?.provider ?? 'gemini';

    switch (provider) {
        case 'gemini':
            return new GeminiEmbeddingProvider(
                {
                    apiKey: providerConfig?.apiKey ?? config.geminiApiKey,
                    model: providerConfig?.model ?? config.embeddingModel,
                },
                rateLimiter,
                logger
            );

        case 'openai': {
            const openaiApiKey = providerConfig?.apiKey ?? env.OPENAI_API_KEY;
            if (!openaiApiKey) {
                throw new ConfigurationError(
                    'OpenAI API key is required for openai provider',
                    { provider: 'openai' }
                );
            }
            return new OpenAIEmbeddingProvider(
                {
                    apiKey: openaiApiKey,
                    model: providerConfig?.model,
                },
                rateLimiter,
                logger
            );
        }

        case 'cohere': {
            const cohereApiKey = providerConfig?.apiKey ?? env.COHERE_API_KEY;
            if (!cohereApiKey) {
                throw new ConfigurationError(
                    'Cohere API key is required for cohere provider',
                    { provider: 'cohere' }
                );
            }
            return new CohereEmbeddingProvider(
                {
                    apiKey: cohereApiKey,
                    model: providerConfig?.model,
                },
                logger
            );
        }

        default:
            throw new ConfigurationError(
                `Unknown embedding provider: ${provider}`,
                { provider }
            );
    }
}

/**
 * Get the dimension for a given provider and model
 */
export function getEmbeddingDimension(provider: string, model?: string): number {
    switch (provider) {
        case 'gemini':
            return 768; // text-embedding-004
        case 'openai':
            // text-embedding-3-small: 1536, text-embedding-3-large: 3072
            return model?.includes('large') ? 3072 : 1536;
        case 'cohere':
            return 1024; // embed-multilingual-v3.0
        default:
            return 768;
    }
}
