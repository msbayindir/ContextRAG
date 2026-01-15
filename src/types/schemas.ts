import { z } from 'zod';
import { ChunkTypeEnum, SearchModeEnum } from './enums.js';

/**
 * Zod schema for IngestOptions validation
 */
export const ingestOptionsSchema = z.object({
    file: z.union([z.instanceof(Buffer), z.string()]),
    filename: z.string().optional(),
    documentType: z.string().optional(),
    promptConfigId: z.string().uuid().optional(),
    customPrompt: z.string().optional(),
    skipExisting: z.boolean().optional().default(false),
    onProgress: z.function().optional(),
});

/**
 * Zod schema for SearchOptions validation
 */
export const searchOptionsSchema = z.object({
    query: z.string().min(1, 'Query is required'),
    limit: z.number().min(1).max(100).optional().default(10),
    mode: z.enum([SearchModeEnum.SEMANTIC, SearchModeEnum.KEYWORD, SearchModeEnum.HYBRID]).optional(),
    minScore: z.number().min(0).max(1).optional(),
    filters: z.object({
        documentTypes: z.array(z.string()).optional(),
        chunkTypes: z.array(z.enum([
            ChunkTypeEnum.TEXT,
            ChunkTypeEnum.TABLE,
            ChunkTypeEnum.LIST,
            ChunkTypeEnum.CODE,
            ChunkTypeEnum.HEADING,
            ChunkTypeEnum.IMAGE_REF,
            ChunkTypeEnum.QUOTE,
            ChunkTypeEnum.MIXED,
        ])).optional(),
        minConfidence: z.number().min(0).max(1).optional(),
        documentIds: z.array(z.string().uuid()).optional(),
        promptConfigIds: z.array(z.string().uuid()).optional(),
        dateRange: z.object({
            start: z.date().optional(),
            end: z.date().optional(),
        }).optional(),
    }).optional(),
    includeExplanation: z.boolean().optional().default(false),
    typeBoost: z.record(z.string(), z.number()).optional(),
});

/**
 * Zod schema for DiscoveryOptions validation
 */
export const discoveryOptionsSchema = z.object({
    file: z.union([z.instanceof(Buffer), z.string()]),
    documentTypeHint: z.string().optional(),
    samplePages: z.array(z.number().int().positive()).optional(),
});

/**
 * Zod schema for CreatePromptConfig validation
 */
export const createPromptConfigSchema = z.object({
    documentType: z.string().min(1, 'Document type is required'),
    name: z.string().min(1, 'Name is required'),
    systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
    chunkStrategy: z.object({
        maxTokens: z.number().min(100).max(2000).optional(),
        overlapTokens: z.number().min(0).max(500).optional(),
        splitBy: z.enum(['page', 'section', 'paragraph', 'semantic']).optional(),
        preserveTables: z.boolean().optional(),
        preserveLists: z.boolean().optional(),
    }).optional(),
    setAsDefault: z.boolean().optional().default(false),
    changeLog: z.string().optional(),
});

/**
 * Zod schema for ApproveStrategyOptions validation
 */
export const approveStrategyOptionsSchema = z.object({
    documentType: z.string().optional(),
    name: z.string().optional(),
    systemPrompt: z.string().optional(),
    chunkStrategy: z.object({
        maxTokens: z.number().min(100).max(2000).optional(),
        overlapTokens: z.number().min(0).max(500).optional(),
        splitBy: z.enum(['page', 'section', 'paragraph', 'semantic']).optional(),
        preserveTables: z.boolean().optional(),
        preserveLists: z.boolean().optional(),
    }).optional(),
    changeLog: z.string().optional(),
});

// Export inferred types
export type ValidatedIngestOptions = z.infer<typeof ingestOptionsSchema>;
export type ValidatedSearchOptions = z.infer<typeof searchOptionsSchema>;
export type ValidatedDiscoveryOptions = z.infer<typeof discoveryOptionsSchema>;
export type ValidatedCreatePromptConfig = z.infer<typeof createPromptConfigSchema>;
export type ValidatedApproveStrategyOptions = z.infer<typeof approveStrategyOptionsSchema>;
