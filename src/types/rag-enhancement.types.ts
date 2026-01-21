/**
 * RAG Enhancement Types
 * 
 * Hierarchical architecture for different RAG enhancement approaches.
 * Supports Anthropic Contextual Retrieval, future Google Grounding, and custom handlers.
 */

// ===== CHUNK DATA (for handlers) =====

export interface ChunkData {
    content: string;
    searchContent: string;
    displayContent: string;
    chunkType: string;
    page: number;
    parentHeading?: string;
}

export interface DocumentContext {
    documentType?: string;
    filename: string;
    pageCount: number;
    /** For LLM strategy: uploaded file URI (Gemini Files API) */
    fileUri?: string;
    /** For LLM strategy: full document text for context (Anthropic-style, max 15k chars) */
    fullDocumentText?: string;
}

// ===== RAG APPROACH TYPES =====

export type RagApproach =
    | 'none'
    | 'anthropic_contextual'
    | 'google_grounding'  // Future
    | 'custom';

// ===== NO ENHANCEMENT =====

export interface NoEnhancementConfig {
    approach: 'none';
}

// ===== ANTHROPIC CONTEXTUAL RETRIEVAL =====

export type AnthropicStrategy = 'none' | 'simple' | 'llm';

export interface AnthropicContextualConfig {
    approach: 'anthropic_contextual';
    strategy: AnthropicStrategy;

    /** Model to use for context generation (default: uses main model)
     * Use a faster model like 'gemini-2.5-flash' for higher RPM
     * Example: 'gemini-2.5-flash', 'gemini-3-flash'
     */
    model?: string;

    /** For 'simple': template pattern
     * Available placeholders: {documentType}, {chunkType}, {page}, {parentHeading}
     * Example: "[{documentType}] [{chunkType}] Page {page}"
     */
    template?: string;

    /** For 'llm': context generation prompt */
    contextPrompt?: string;

    /** For 'llm': max tokens for generated context (default: 100) */
    maxContextTokens?: number;

    /** Chunk types to skip context generation for (default: ['HEADING', 'IMAGE_REF']) */
    skipChunkTypes?: string[];

    /** Max concurrent LLM calls (default: 5) */
    concurrencyLimit?: number;

    /** Enable caching to avoid duplicate API calls (default: true) */
    enableCache?: boolean;
}

// ===== GOOGLE GROUNDING (Future) =====

export type GoogleGroundingStrategy = 'search' | 'factcheck';

export interface GoogleGroundingConfig {
    approach: 'google_grounding';
    strategy: GoogleGroundingStrategy;
    // Future config options
}

// ===== CUSTOM ENHANCEMENT =====

export interface EnhancementContext {
    chunk: ChunkData;
    doc: DocumentContext;
}

export type CustomEnhancementHandler = (ctx: EnhancementContext) => Promise<string>;

export interface CustomEnhancementConfig {
    approach: 'custom';
    handler: CustomEnhancementHandler;

    /** Chunk types to skip (optional) */
    skipChunkTypes?: string[];
}

// ===== UNION TYPE =====

export type RagEnhancementConfig =
    | NoEnhancementConfig
    | AnthropicContextualConfig
    | GoogleGroundingConfig
    | CustomEnhancementConfig;

// ===== ENHANCEMENT HANDLER INTERFACE =====

export interface EnhancementHandler {
    /**
     * Generate context for a chunk
     * @returns Context string to prepend to searchContent, or empty string
     */
    generateContext(chunk: ChunkData, doc: DocumentContext): Promise<string>;

    /**
     * Check if this chunk type should be skipped
     */
    shouldSkip(chunkType: string): boolean;
}

// ===== DEFAULT VALUES =====

export const DEFAULT_ANTHROPIC_CONFIG = {
    maxContextTokens: 100,
    skipChunkTypes: ['HEADING', 'IMAGE_REF'],
    concurrencyLimit: 5,
    enableCache: true,
    template: '[{documentType}] [{chunkType}] Page {page}',
    contextPrompt: 'Situate this chunk within the document. Briefly explain what this chunk is about and where it appears in the document in 1-2 sentences:',
} as const;
