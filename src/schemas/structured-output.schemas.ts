/**
 * Structured Output Schemas
 * 
 * Zod schemas for Gemini API structured output.
 * These schemas ensure type-safe, validated responses from AI.
 * 
 * @module schemas/structured-output
 */

import { z } from 'zod';

// ============================================
// CHUNK TYPE SCHEMA
// ============================================

/**
 * Valid chunk types for document sections
 */
export const ChunkTypeSchema = z.enum([
    'TEXT',
    'TABLE',
    'LIST',
    'HEADING',
    'CODE',
    'QUOTE',
    'IMAGE_REF',
    'QUESTION',
    'MIXED'
]);

export type ChunkType = z.infer<typeof ChunkTypeSchema>;

// ============================================
// SECTION SCHEMA (Extraction Output)
// ============================================

/**
 * Single section extracted from document
 */
export const SectionSchema = z.object({
    /** Content type */
    type: ChunkTypeSchema,
    /** Source page number (1-indexed) */
    page: z.number().int().min(1),
    /** Extraction confidence score (0.0-1.0) */
    confidence: z.number().min(0).max(1),
    /** Extracted content in Markdown format */
    content: z.string().min(1)
});

export type Section = z.infer<typeof SectionSchema>;

/**
 * Array of sections (batch extraction result)
 */
export const SectionArraySchema = z.array(SectionSchema);

export type SectionArray = z.infer<typeof SectionArraySchema>;

// ============================================
// DISCOVERY SCHEMA
// ============================================

/**
 * Detected element type enum
 */
export const DetectedElementTypeSchema = z.enum([
    'table',
    'list',
    'code',
    'image',
    'chart',
    'form',
    'heading'
]);

/**
 * Detected element in document (table, figure, etc.)
 */
export const DetectedElementSchema = z.object({
    /** Element type */
    type: DetectedElementTypeSchema,
    /** Approximate count */
    count: z.number().int().min(0),
    /** Example locations (page numbers) */
    examples: z.array(z.number()).optional()
});

export type DetectedElement = z.infer<typeof DetectedElementSchema>;

/**
 * Chunk strategy configuration from discovery
 */
export const ChunkStrategySchema = z.object({
    /** Maximum tokens per chunk */
    maxTokens: z.number().int().min(100).max(2000).default(500),
    /** Split method */
    splitBy: z.enum(['semantic', 'page', 'paragraph', 'section']).default('semantic'),
    /** Preserve tables as single chunks */
    preserveTables: z.boolean().default(true),
    /** Preserve lists as single chunks */
    preserveLists: z.boolean().default(true)
});

export type ChunkStrategy = z.infer<typeof ChunkStrategySchema>;

/**
 * Discovery AI response schema
 * Full analysis result from Gemini
 */
export const DiscoveryResponseSchema = z.object({
    /** Detected document type (e.g., 'Medical', 'Legal') */
    documentType: z.string().min(1),
    /** Human-readable document type name */
    documentTypeName: z.string().min(1),
    /** Document language (e.g., 'tr', 'en') */
    language: z.string().optional(),
    /** Document complexity assessment */
    complexity: z.enum(['low', 'medium', 'high']).optional(),
    /** Detected elements in document */
    detectedElements: z.array(DetectedElementSchema).default([]),
    /** Document-specific extraction instructions */
    specialInstructions: z.array(z.string()),
    /** Example formats for each element type */
    exampleFormats: z.array(z.object({
        element: z.string(),
        format: z.string()
    })).optional(),
    /** Recommended chunk strategy */
    chunkStrategy: ChunkStrategySchema.optional(),
    /** Detection confidence (0.0-1.0) */
    confidence: z.number().min(0).max(1),
    /** AI reasoning for the analysis */
    reasoning: z.string()
});

export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;
// Updated exampleFormats type
export type ExampleFormat = { element: string; format: string };

// ============================================
// CONTEXT GENERATION SCHEMA
// ============================================

/**
 * Context generation result for RAG enhancement
 */
export const ContextGenerationSchema = z.object({
    /** Generated context text */
    context: z.string(),
    /** Confidence in the generated context */
    confidence: z.number().min(0).max(1).optional()
});

export type ContextGeneration = z.infer<typeof ContextGenerationSchema>;

import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert Zod schema to Gemini-compatible JSON Schema
 * 
 * Uses zod-to-json-schema to generate a robust JSON schema.
 * Configured to avoid $ref which Gemini API doesn't support well in some contexts.
 * 
 * @param zodSchema - Zod schema to convert
 * @returns Gemini-compatible JSON schema
 */
/**
 * Convert Zod schema to Gemini-compatible JSON Schema
 * 
 * Uses zod-to-json-schema to generate a robust JSON schema.
 * Configured to avoid $ref which Gemini API doesn't support well in some contexts.
 * Post-processes the schema to remove fields not supported by Gemini (like additionalProperties).
 * 
 * @param zodSchema - Zod schema to convert
 * @returns Gemini-compatible JSON schema
 */
export function zodToGeminiSchema(zodSchema: z.ZodType): any {
    const jsonSchema = zodToJsonSchema(zodSchema, {
        target: 'jsonSchema7',
        $refStrategy: 'none', // Critical: Gemini doesn't support $ref in responseSchema
        definitionPath: '$defs',
    });

    return cleanSchemaForGemini(jsonSchema);
}

/**
 * Remove fields that Gemini API doesn't support
 */
/**
 * Remove fields that Gemini API doesn't support
 */
function cleanSchemaForGemini(schema: any): any {
    if (typeof schema !== 'object' || schema === null) {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map(cleanSchemaForGemini);
    }

    const newObj: any = {};
    for (const [key, value] of Object.entries(schema)) {
        // Forbidden fields in Gemini responseSchema
        if (key === 'additionalProperties' ||
            key === '$schema' ||
            key === 'title' ||
            key === 'default') {
            continue;
        }

        // Handle description allow-list logic implicitly by not including it in forbidden

        newObj[key] = cleanSchemaForGemini(value);
    }
    return newObj;
}

// ============================================
// SCHEMA EXPORTS FOR GEMINI API
// ============================================

/**
 * Pre-converted Gemini schemas for API calls
 */
export const GeminiSchemas = {
    /** Schema for section extraction */
    sectionArray: zodToGeminiSchema(SectionArraySchema),
    /** Schema for discovery response */
    discovery: zodToGeminiSchema(DiscoveryResponseSchema),
    /** Schema for context generation */
    contextGeneration: zodToGeminiSchema(ContextGenerationSchema)
} as const;
