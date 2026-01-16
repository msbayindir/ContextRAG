import type { ResolvedConfig } from '../types/config.types.js';
import type {
    DiscoveryResult,
    DiscoveryOptions,
    DetectedElement,
} from '../types/discovery.types.js';
import type { ChunkStrategy } from '../types/chunk.types.js';
import { GeminiService } from '../services/gemini.service.js';
import { PDFProcessor } from '../services/pdf.processor.js';
import type { Logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { generateCorrelationId } from '../utils/index.js';
import { DEFAULT_CHUNK_STRATEGY } from '../types/prompt.types.js';
import { buildDiscoveryPrompt } from '../config/templates.js';

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

/**
 * Parsed discovery response from AI
 */
interface DiscoveryAIResponse {
    documentType: string;
    documentTypeName: string;
    language?: string;
    complexity?: 'low' | 'medium' | 'high';
    detectedElements: DetectedElement[];
    specialInstructions: string[];
    exampleFormats?: Record<string, string>;
    chunkStrategy?: Partial<ChunkStrategy>;
    confidence: number;
    reasoning: string;
}

/**
 * Discovery engine for automatic prompt generation
 * 
 * Uses structured template system to analyze documents and generate
 * document-specific extraction instructions.
 */
export class DiscoveryEngine {
    private readonly gemini: GeminiService;
    private readonly pdfProcessor: PDFProcessor;
    private readonly logger: Logger;
    private readonly sessions: Map<string, DiscoverySession> = new Map();

    constructor(
        config: ResolvedConfig,
        rateLimiter: RateLimiter,
        logger: Logger
    ) {
        this.gemini = new GeminiService(config, rateLimiter, logger);
        this.pdfProcessor = new PDFProcessor(logger);
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

        // Create vision part for analysis
        const pdfPart = this.pdfProcessor.createVisionPart(buffer);

        // Build discovery prompt from template
        const prompt = buildDiscoveryPrompt(options.documentTypeHint);

        // Call Gemini with full document
        const response = await this.gemini.generateWithVision(prompt, [pdfPart]);

        // Parse response
        let analysisResult: DiscoveryAIResponse;

        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response.text;
            const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch?.[1]) {
                jsonStr = jsonMatch[1];
            }
            analysisResult = JSON.parse(jsonStr) as DiscoveryAIResponse;

            // Validate required fields
            if (!analysisResult.documentType) {
                throw new Error('Missing documentType in response');
            }
            if (!Array.isArray(analysisResult.specialInstructions)) {
                // Fallback: convert old suggestedPrompt to instructions if present
                analysisResult.specialInstructions = this.getDefaultInstructions();
            }
        } catch (parseError) {
            this.logger.warn('Failed to parse discovery response as JSON, using defaults', {
                error: (parseError as Error).message,
            });

            // Use defaults
            analysisResult = {
                documentType: options.documentTypeHint ?? 'General',
                documentTypeName: options.documentTypeHint ?? 'General Document',
                detectedElements: [],
                specialInstructions: this.getDefaultInstructions(),
                chunkStrategy: DEFAULT_CHUNK_STRATEGY,
                confidence: 0.5,
                reasoning: 'Failed to parse AI response, using default configuration',
            };
        }

        // Build discovery result
        const discoveryResult: DiscoveryResult = {
            id: correlationId,
            documentType: analysisResult.documentType,
            documentTypeName: analysisResult.documentTypeName,
            detectedElements: analysisResult.detectedElements ?? [],
            specialInstructions: analysisResult.specialInstructions,
            exampleFormats: analysisResult.exampleFormats,
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
