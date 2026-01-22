/**
 * System constants for Context-RAG
 * Centralizes magic numbers for maintainability
 */

// ============================================
// Generation Settings
// ============================================

export const GENERATION_DEFAULTS = {
    /**
     * Simple text generation (context enhancement, generateSimple)
     */
    SIMPLE: {
        temperature: 0.3,
        maxOutputTokens: 200,
    },

    /**
     * Reranking tasks (generateForReranking)
     */
    RERANKING: {
        temperature: 0.1,
        maxOutputTokens: 2048,
    },

    /**
     * Structured output generation (generateStructured)
     */
    STRUCTURED: {
        temperature: 0.2,
        maxRetries: 2,
    },

    /**
     * Context generation with PDF (generateWithPdfUri, generateWithFileRef)
     */
    PDF_CONTEXT: {
        temperature: 0.3,
        maxOutputTokens: 200,
    },

    /**
     * Context generation for Anthropic-style enhancement
     */
    CONTEXT_GENERATION: {
        temperature: 0.1,
        maxOutputTokens: 1024, // Previously 256 * 4
    },
} as const;

// ============================================
// Search Settings
// ============================================

export const SEARCH_DEFAULTS = {
    /**
     * Document snippet limit for reranking display
     * Truncates long content for efficient LLM processing
     */
    RERANK_SNIPPET_LENGTH: 400,

    /**
     * Full-text search language configuration
     * 'simple' is language-agnostic and works for all languages including Turkish
     * Alternative: 'english', 'turkish', etc. for language-specific stemming
     */
    FTS_LANGUAGE: 'simple',
} as const;

// ============================================
// Processing Limits
// ============================================

export const PROCESSING_LIMITS = {
    /**
     * Minimum chunk content length to be stored
     * Chunks shorter than this are skipped
     */
    MIN_CHUNK_LENGTH: 10,
} as const;

// ============================================
// Type exports for type-safe access
// ============================================

export type GenerationDefaults = typeof GENERATION_DEFAULTS;
export type SearchDefaults = typeof SEARCH_DEFAULTS;
export type ProcessingLimits = typeof PROCESSING_LIMITS;
