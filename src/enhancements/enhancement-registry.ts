/**
 * Enhancement Registry
 * 
 * Factory for creating enhancement handlers based on configuration.
 */

import type {
    RagEnhancementConfig,
    EnhancementHandler,
    ChunkData,
    DocumentContext
} from '../types/rag-enhancement.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import type { GeminiService } from '../services/gemini.service.js';
import { ConfigurationError } from '../errors/index.js';
import { NoOpHandler } from './no-op.handler.js';
import { AnthropicHandler } from './anthropic/anthropic.handler.js';

/**
 * Create an enhancement handler based on configuration
 */
export function createEnhancementHandler(
    config: RagEnhancementConfig | undefined,
    _resolvedConfig: ResolvedConfig,
    gemini: GeminiService
): EnhancementHandler {

    if (!config || config.approach === 'none') {
        return new NoOpHandler();
    }

    switch (config.approach) {
        case 'anthropic_contextual':
            return new AnthropicHandler(config, gemini, _resolvedConfig);

        case 'google_grounding':
            // Future implementation
            throw new ConfigurationError('Google Grounding is not yet implemented', {
                approach: 'google_grounding',
            });

        case 'custom':
            return new CustomHandler(config.handler, config.skipChunkTypes);

        default:
            throw new ConfigurationError(`Unknown RAG enhancement approach`, {
                approach: (config as RagEnhancementConfig).approach,
            });
    }
}

/**
 * Custom handler wrapper
 */
class CustomHandler implements EnhancementHandler {
    constructor(
        private readonly handler: (ctx: { chunk: ChunkData; doc: DocumentContext }) => Promise<string>,
        private readonly skipChunkTypes?: string[]
    ) { }

    shouldSkip(chunkType: string): boolean {
        return this.skipChunkTypes?.includes(chunkType) ?? false;
    }

    async generateContext(chunk: ChunkData, doc: DocumentContext): Promise<string> {
        if (this.shouldSkip(chunk.chunkType)) {
            return '';
        }
        return this.handler({ chunk, doc });
    }
}
