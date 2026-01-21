/**
 * Embedding Provider Factory
 * 
 * Creates the appropriate embedding provider based on configuration.
 * Currently supports Gemini, with OpenAI and Cohere planned for Phase 3.
 */

import type { EmbeddingProvider, EmbeddingProviderConfig } from '../types/embedding-provider.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';
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

        case 'openai':
            // Phase 3: OpenAI support
            throw new ConfigurationError(
                'OpenAI embedding provider not yet implemented. Coming in Phase 3.',
                { provider: 'openai' }
            );

        case 'cohere':
            // Phase 3: Cohere support
            throw new ConfigurationError(
                'Cohere embedding provider not yet implemented. Coming in Phase 3.',
                { provider: 'cohere' }
            );

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
