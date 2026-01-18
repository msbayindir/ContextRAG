/**
 * Structured Output Schemas
 * Re-export all schemas for easy access
 */

export {
    // Chunk types
    ChunkTypeSchema,
    type ChunkType,

    // Section schemas
    SectionSchema,
    SectionArraySchema,
    type Section,
    type SectionArray,

    // Discovery schemas
    DetectedElementSchema,
    ChunkStrategySchema,
    DiscoveryResponseSchema,
    type DetectedElement,
    type ChunkStrategy,
    type DiscoveryResponse,

    // Context generation
    ContextGenerationSchema,
    type ContextGeneration,

    // Gemini converter
    zodToGeminiSchema,
    GeminiSchemas
} from './structured-output.schemas.js';
