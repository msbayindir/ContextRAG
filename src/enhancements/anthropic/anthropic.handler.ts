/**
 * Anthropic Contextual Retrieval Handler
 * 
 * Implements Anthropic's Contextual Retrieval approach with 3 strategies:
 * - none: No context generation
 * - simple: Template-based context (free)
 * - llm: LLM-generated context (best quality, costs ~$0.005/chunk)
 */

import type {
    AnthropicContextualConfig,
    EnhancementHandler,
    ChunkData,
    DocumentContext
} from '../../types/rag-enhancement.types.js';
import { DEFAULT_ANTHROPIC_CONFIG as DEFAULTS } from '../../types/rag-enhancement.types.js';
import { GeminiService } from '../../services/gemini.service.js';
import type { ResolvedConfig } from '../../types/config.types.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import { createLogger } from '../../utils/logger.js';
import pLimit from 'p-limit';

export class AnthropicHandler implements EnhancementHandler {
    private readonly config: AnthropicContextualConfig;
    private readonly gemini: GeminiService;
    private readonly limit: ReturnType<typeof pLimit>;
    private readonly skipTypes: Set<string>;

    constructor(
        config: AnthropicContextualConfig,
        mainGemini: GeminiService,
        resolvedConfig: ResolvedConfig
    ) {
        this.config = config;
        this.limit = pLimit(config.concurrencyLimit ?? DEFAULTS.concurrencyLimit);
        this.skipTypes = new Set(config.skipChunkTypes ?? DEFAULTS.skipChunkTypes);

        // If a separate model is specified for enhancement, create a new GeminiService
        if (config.model && config.model !== resolvedConfig.model) {
            console.log(`[AnthropicHandler] Using separate model for enhancement: ${config.model}`);
            const enhancementConfig: ResolvedConfig = {
                ...resolvedConfig,
                model: config.model,
            };
            const rateLimiter = new RateLimiter(resolvedConfig.rateLimitConfig);
            const logger = createLogger(resolvedConfig.logging);
            this.gemini = new GeminiService(enhancementConfig, rateLimiter, logger);
        } else {
            this.gemini = mainGemini;
        }
    }

    shouldSkip(chunkType: string): boolean {
        return this.skipTypes.has(chunkType);
    }

    async generateContext(chunk: ChunkData, doc: DocumentContext): Promise<string> {
        // Skip if chunk type is in skip list
        if (this.shouldSkip(chunk.chunkType)) {
            return '';
        }

        switch (this.config.strategy) {
            case 'none':
                return '';

            case 'simple':
                return this.generateSimpleContext(chunk, doc);

            case 'llm':
                return this.limit(() => this.generateLLMContext(chunk, doc));

            default:
                return '';
        }
    }

    /**
     * Simple template-based context generation (free)
     */
    private generateSimpleContext(chunk: ChunkData, doc: DocumentContext): string {
        const template = this.config.template ?? DEFAULTS.template;

        return template
            .replace('{documentType}', doc.documentType ?? 'Document')
            .replace('{chunkType}', chunk.chunkType)
            .replace('{page}', String(chunk.page))
            .replace('{parentHeading}', chunk.parentHeading ?? '');
    }

    /**
     * LLM-based context generation (best quality, ~$0.005/chunk)
     */
    private async generateLLMContext(chunk: ChunkData, doc: DocumentContext): Promise<string> {
        const prompt = this.config.contextPrompt ?? DEFAULTS.contextPrompt;

        const fullPrompt = `${prompt}

<document_info>
Dosya: ${doc.filename}
Tip: ${doc.documentType ?? 'Bilinmiyor'}
Toplam Sayfa: ${doc.pageCount}
</document_info>

${doc.fullDocumentText ? `<full_document>
${doc.fullDocumentText.slice(0, 15000)}
</full_document>

` : ''}<chunk_to_contextualize>
${chunk.content}
</chunk_to_contextualize>

Bu içeriğin belgenin genel akışı içindeki yerini, bağlı olduğu ana başlıkları ve ele aldığı konuyu detaylı bir şekilde özetle. İçeriğin ne olduğunu değil, bağlamını anlat:`;

        try {
            // If we have a cached PDF URI, use it for full document context (Anthropic-style)
            if (doc.fileUri) {
                const chunkPrompt = `Bu içeriğin belgenin genel akışı içindeki yerini, bağlı olduğu ana başlıkları ve ele aldığı konuyu detaylı bir şekilde özetle. İçeriğin ne olduğunu değil, bağlamını anlat:

<chunk>
${chunk.content}
</chunk>`;
                const result = await this.gemini.generateWithPdfUri(doc.fileUri, chunkPrompt, {
                    maxOutputTokens: 2048,
                    temperature: 0.3
                });
                return result.text;
            }

            // Otherwise, generate without full document context
            const result = await this.gemini.generateSimple(fullPrompt);
            return result;
        } catch (error) {
            // On error, fall back to simple context
            console.warn('LLM context generation failed, using simple context:', error);
            return this.generateSimpleContext(chunk, doc);
        }
    }
}
