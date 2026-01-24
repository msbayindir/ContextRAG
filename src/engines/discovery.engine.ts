import type { ResolvedConfig } from '../types/config.types.js';
import type {
    DiscoveryResult,
    DiscoveryOptions,
} from '../types/discovery.types.js';
import type { ILLMService } from '../types/llm-service.types.js';
import type { IPDFProcessor } from '../types/pdf-processor.types.js';
import type { Logger } from '../utils/logger.js';
import { generateCorrelationId } from '../errors/index.js';
import { DEFAULT_CHUNK_STRATEGY } from '../types/prompt.types.js';
import { buildDiscoveryPrompt } from '../config/templates.js';
import { DiscoveryResponseSchema, type DiscoveryResponse } from '../schemas/index.js';

/**
 * Discovery session storage
 */
interface DiscoverySession {
    id: string;
    result: DiscoveryResult;
    fileBuffer: Buffer;
    createdAt: Date;
    expiresAt: Date;
}

// Note: DiscoveryAIResponse replaced by Zod schema DiscoveryResponseSchema

/**
 * Discovery engine for automatic prompt generation
 * 
 * Uses structured template system to analyze documents and generate
 * document-specific extraction instructions.
 * 
 * @example
 * ```typescript
 * const engine = new DiscoveryEngine(config, llmService, pdfProcessor, logger);
 * const result = await engine.discover({ file: pdfBuffer });
 * ```
 */
export class DiscoveryEngine {
    private readonly llm: ILLMService;
    private readonly pdfProcessor: IPDFProcessor;
    private readonly logger: Logger;
    private readonly sessions: Map<string, DiscoverySession> = new Map();

    /**
     * Create a new DiscoveryEngine
     * @param _config - Resolved configuration (reserved for future use)
     * @param llm - LLM service for AI operations
     * @param pdfProcessor - PDF processor service
     * @param logger - Logger instance
     */
    constructor(
        // @ts-expect-error Reserved for future configuration-based features
        private readonly config: ResolvedConfig,
        llm: ILLMService,
        pdfProcessor: IPDFProcessor,
        logger: Logger
    ) {
        this.llm = llm;
        this.pdfProcessor = pdfProcessor;
        this.logger = logger;
    }

    /**
     * Analyze a document and generate processing strategy
     */
    async discover(options: DiscoveryOptions): Promise<DiscoveryResult> {
        const correlationId = generateCorrelationId();

        this.logger.info('Starting document discovery', { correlationId });

        // Load PDF
        const { buffer, metadata } = await this.pdfProcessor.load(options.file);

        // Upload PDF to LLM provider (cache for analysis)
        const fileUri = await this.llm.uploadDocument(buffer, metadata.filename);

        // Build discovery prompt from template
        const prompt = buildDiscoveryPrompt(options.documentTypeHint);

        // Call LLM with structured output (native JSON schema)
        let analysisResult: DiscoveryResponse;

        try {
            const response = await this.llm.generateStructuredWithDocument<DiscoveryResponse>(
                fileUri,
                prompt,
                DiscoveryResponseSchema
            );
            // Start with mapping
            const detectedElements = response.data.detectedElements?.map(el => ({
                type: el.type,
                count: el.count ?? 0,
                examples: el.examples
            })) ?? [];

            const exampleFormats = response.data.exampleFormats?.map(ef => ({
                element: ef.element,
                format: ef.format
            }));

            analysisResult = {
                ...response.data,
                detectedElements,
                exampleFormats,
            };

            this.logger.debug('Structured discovery response received', {
                documentType: analysisResult.documentType,
                confidence: analysisResult.confidence,
            });
        } catch (structuredError) {
            this.logger.warn('Structured output failed, trying legacy parsing', {
                error: (structuredError as Error).message,
            });

            // Fallback to legacy parsing
            try {
                const response = await this.llm.generateWithDocument(fileUri, prompt);
                let jsonStr = response.text;
                const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
                if (jsonMatch?.[1]) {
                    jsonStr = jsonMatch[1];
                }
                const parsed = JSON.parse(jsonStr);
                analysisResult = DiscoveryResponseSchema.parse(parsed);
            } catch (legacyError) {
                this.logger.warn('All parsing methods failed, using defaults', {
                    error: (legacyError as Error).message,
                });

                // Use defaults - cast to satisfy type system
                analysisResult = {
                    documentType: options.documentTypeHint ?? 'General',
                    documentTypeName: options.documentTypeHint ?? 'General Document',
                    detectedElements: [],
                    specialInstructions: this.getDefaultInstructions(),
                    chunkStrategy: {
                        maxTokens: DEFAULT_CHUNK_STRATEGY.maxTokens,
                        splitBy: DEFAULT_CHUNK_STRATEGY.splitBy as 'semantic' | 'page' | 'paragraph' | 'section',
                        preserveTables: DEFAULT_CHUNK_STRATEGY.preserveTables ?? true,
                        preserveLists: DEFAULT_CHUNK_STRATEGY.preserveLists ?? true,
                    },
                    confidence: 0.5,
                    reasoning: 'Failed to parse AI response, using default configuration',
                };
            }
        }

        // Build discovery result
        const discoveryResult: DiscoveryResult = {
            id: correlationId,
            documentType: analysisResult.documentType,
            documentTypeName: analysisResult.documentTypeName,
            // Map strictly to ensure type safety
            detectedElements: analysisResult.detectedElements?.map(el => ({
                type: el.type,
                count: el.count ?? 0,
                examples: el.examples
            })) ?? [],
            specialInstructions: analysisResult.specialInstructions,
            exampleFormats: analysisResult.exampleFormats?.map(ef => ({
                element: ef.element,
                format: ef.format
            })),
            suggestedChunkStrategy: {
                ...DEFAULT_CHUNK_STRATEGY,
                ...analysisResult.chunkStrategy,
            },
            confidence: analysisResult.confidence ?? 0.5,
            reasoning: analysisResult.reasoning ?? '',
            pageCount: metadata.pageCount,
            fileHash: metadata.fileHash,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        };

        // Store session for later approval
        this.sessions.set(correlationId, {
            id: correlationId,
            result: discoveryResult,
            fileBuffer: buffer,
            createdAt: new Date(),
            expiresAt: discoveryResult.expiresAt,
        });

        // Clean up old sessions
        this.cleanupSessions();

        this.logger.info('Discovery completed', {
            correlationId,
            documentType: discoveryResult.documentType,
            confidence: discoveryResult.confidence,
            instructionCount: discoveryResult.specialInstructions.length,
        });

        return discoveryResult;
    }

    /**
     * Get stored discovery session
     */
    getSession(id: string): DiscoverySession | undefined {
        const session = this.sessions.get(id);
        if (session && session.expiresAt > new Date()) {
            return session;
        }
        return undefined;
    }

    /**
     * Remove a session after approval
     */
    removeSession(id: string): void {
        this.sessions.delete(id);
    }

    /**
     * Clean up expired sessions
     */
    private cleanupSessions(): void {
        const now = new Date();
        for (const [id, session] of this.sessions) {
            if (session.expiresAt <= now) {
                this.sessions.delete(id);
            }
        }
    }

    /**
     * Get default extraction instructions
     */
    private getDefaultInstructions(): string[] {
        return [
            'Extract all text content preserving structure',
            'Convert tables to Markdown table format',
            'Convert lists to Markdown list format',
            'Preserve headings with appropriate # levels',
            'Note any images with [IMAGE: description]',
            'Maintain the logical flow of content',
        ];
    }
}
