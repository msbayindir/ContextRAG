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

/**
 * Discovery prompt for document analysis
 */
const DISCOVERY_PROMPT = `You are a document analysis AI. Analyze the provided document and determine the optimal processing strategy.

Analyze the document and provide:
1. Document Type: What kind of document is this? (e.g., Medical, Legal, Technical, Financial, Academic, etc.)
2. Structure Analysis:
   - Are there tables? How many approximately?
   - Are there lists (bulleted/numbered)?
   - Are there code blocks?
   - Are there images/charts/figures?
   - Are there forms?
3. Content Organization: How is content organized? (chapters, sections, articles, etc.)
4. Language and Complexity: What is the language and technical level?
5. Recommended Processing Strategy:
   - How should this document be chunked? (by page, section, paragraph, table)
   - What should be the ideal chunk size?
   - Should tables be kept intact or split?
   - Any special handling needed?

Respond in JSON format:
{
  "documentType": "string",
  "documentTypeName": "Human readable name",
  "detectedElements": [
    { "type": "table|list|code|image|chart|form|heading", "count": number, "examples": [page_numbers] }
  ],
  "language": "string",
  "complexity": "low|medium|high",
  "organization": "description of how content is organized",
  "suggestedPrompt": "The system prompt to use for processing this document",
  "suggestedChunkStrategy": {
    "maxTokens": number,
    "overlapTokens": number,
    "splitBy": "page|section|paragraph|semantic",
    "preserveTables": boolean,
    "preserveLists": boolean
  },
  "confidence": number (0-1),
  "reasoning": "explanation of why this strategy was chosen"
}`;

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
 * Discovery engine for automatic prompt generation
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

        // Build prompt
        let prompt = DISCOVERY_PROMPT;
        if (options.documentTypeHint) {
            prompt += `\n\nHint: The user expects this to be a "${options.documentTypeHint}" document.`;
        }

        // Call Gemini with full document
        const response = await this.gemini.generateWithVision(prompt, [pdfPart]);

        // Parse response
        let analysisResult: {
            documentType: string;
            documentTypeName: string;
            detectedElements: DetectedElement[];
            suggestedPrompt: string;
            suggestedChunkStrategy: Partial<ChunkStrategy>;
            confidence: number;
            reasoning: string;
        };

        try {
            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = response.text;
            const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch?.[1]) {
                jsonStr = jsonMatch[1];
            }
            analysisResult = JSON.parse(jsonStr);
        } catch (parseError) {
            this.logger.warn('Failed to parse discovery response as JSON, using defaults', {
                error: (parseError as Error).message,
            });

            // Use defaults
            analysisResult = {
                documentType: options.documentTypeHint ?? 'General',
                documentTypeName: options.documentTypeHint ?? 'General Document',
                detectedElements: [],
                suggestedPrompt: this.getDefaultPrompt(),
                suggestedChunkStrategy: DEFAULT_CHUNK_STRATEGY,
                confidence: 0.5,
                reasoning: 'Failed to parse AI response, using default configuration',
            };
        }

        // Build discovery result
        const discoveryResult: DiscoveryResult = {
            id: correlationId,
            documentType: analysisResult.documentType,
            documentTypeName: analysisResult.documentTypeName,
            detectedElements: analysisResult.detectedElements,
            suggestedPrompt: analysisResult.suggestedPrompt,
            suggestedChunkStrategy: {
                ...DEFAULT_CHUNK_STRATEGY,
                ...analysisResult.suggestedChunkStrategy,
            },
            confidence: analysisResult.confidence,
            reasoning: analysisResult.reasoning,
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
     * Get default extraction prompt
     */
    private getDefaultPrompt(): string {
        return `You are a document processing AI. Extract and structure all content from the document.

Instructions:
1. Extract all text content, preserving structure
2. Convert tables to Markdown table format using | column | format
3. Convert lists to Markdown list format
4. Preserve headings with appropriate # levels
5. Note any images with [IMAGE: description]
6. Maintain logical flow of content

Output clean, well-formatted Markdown.`;
    }
}
