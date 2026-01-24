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
import type { ResolvedConfig } from '../../types/config.types.js';
import type { IDocumentLLMService, ITextLLMService, ILLMServiceFactory } from '../../types/llm-service.types.js';
import type { Logger } from '../../utils/logger.js';
import pLimit from 'p-limit';
import { GENERATION_DEFAULTS } from '../../config/constants.js';

export class AnthropicHandler implements EnhancementHandler {
    private readonly config: AnthropicContextualConfig;
    private readonly llm: IDocumentLLMService & ITextLLMService;
    private readonly limit: ReturnType<typeof pLimit>;
    private readonly skipTypes: Set<string>;
    private readonly logger: Logger;

    constructor(
        config: AnthropicContextualConfig,
        mainLlm: IDocumentLLMService & ITextLLMService,
        resolvedConfig: ResolvedConfig,
        llmFactory: ILLMServiceFactory,
        logger: Logger
    ) {
        this.config = config;
        this.limit = pLimit(config.concurrencyLimit ?? DEFAULTS.concurrencyLimit);
        this.skipTypes = new Set(config.skipChunkTypes ?? DEFAULTS.skipChunkTypes);
        this.logger = logger;

        // If a separate model is specified for enhancement, create a new LLM service
        if (config.model && config.model !== resolvedConfig.model) {
            this.logger.info('Using separate model for enhancement', { model: config.model });
            const enhancementConfig: ResolvedConfig = {
                ...resolvedConfig,
                model: config.model,
                llmProvider: {
                    ...resolvedConfig.llmProvider,
                    model: config.model,
                },
                documentProvider: {
                    ...resolvedConfig.documentProvider,
                    model: config.model,
                },
            };
            this.llm = llmFactory.create(enhancementConfig);
        } else {
            this.llm = mainLlm;
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
     * Uses structured metadata format for better BM25/vector performance
     */
    private generateSimpleContext(chunk: ChunkData, doc: DocumentContext): string {
        // Structured format: short, metadata-like, distinctive
        return `[Source: ${doc.filename}] [Type: ${chunk.chunkType}] [Page: ${chunk.page}]${chunk.parentHeading ? ` [Section: ${chunk.parentHeading}]` : ''}`;
    }

    /**
     * LLM-based structured context generation (best quality, ~$0.005/chunk)
     * Generates short, structured metadata instead of prose
     */
    private async generateLLMContext(chunk: ChunkData, doc: DocumentContext): Promise<string> {
        // Structured context prompt - NO prose, just metadata
        const structuredPrompt = `Analyze this chunk and generate ONLY structured metadata.

OUTPUT FORMAT (use EXACTLY this format, nothing else):
[Section: <main topic/chapter>]
[Subsection: <specific area if applicable>]
[Keywords: <3-5 key terms, comma separated>]

RULES:
- Maximum 100 words total
- NO sentences, NO explanations, NO prose
- Turkish or English based on content language
- If subsection not clear, omit it

<chunk>
${chunk.content}
</chunk>`;

        try {
            // If we have a cached PDF URI, use it for full document context
            if (doc.fileUri) {
                const result = await this.llm.generateWithDocument(doc.fileUri, structuredPrompt, {
                    maxOutputTokens: GENERATION_DEFAULTS.CONTEXT_GENERATION.maxOutputTokens,
                    temperature: GENERATION_DEFAULTS.CONTEXT_GENERATION.temperature
                });
                return result.text.trim();
            }

            // Fallback without PDF context
            const result = await this.llm.generateSimple(structuredPrompt);
            return result.trim();
        } catch (error) {
            // On error, fall back to simple context
            this.logger.warn('LLM context generation failed, using simple context', {
                error: error instanceof Error ? error.message : String(error)
            });
            return this.generateSimpleContext(chunk, doc);
        }
    }
}
