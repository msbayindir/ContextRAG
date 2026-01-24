import type { ChunkStrategy } from './chunk.types.js';

/**
 * Prompt configuration stored in database
 */
export interface PromptConfig {
    id: string;
    /** Document type identifier (e.g., 'Medical', 'Legal') */
    documentType: string;
    /** Human-readable name */
    name: string;
    /** System prompt for AI processing */
    systemPrompt: string;
    /** Chunking strategy configuration */
    chunkStrategy: ChunkStrategy;
    /** Version number for this document type */
    version: number;
    /** Whether this config is active */
    isActive: boolean;
    /** Whether this is the default for the document type */
    isDefault: boolean;
    /** Who created this config: 'discovery' | 'manual' | user ID */
    createdBy?: string;
    /** Change log / reason for this version */
    changeLog?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Input for creating a new prompt config
 */
export interface CreatePromptConfig {
    /** Document type identifier */
    documentType: string;
    /** Human-readable name */
    name: string;
    /** System prompt for AI processing */
    systemPrompt: string;
    /** Optional chunk strategy (defaults applied if not provided) */
    chunkStrategy?: Partial<ChunkStrategy>;
    /** Set as default for this document type */
    setAsDefault?: boolean;
    /** Change log / reason */
    changeLog?: string;
}

/**
 * Input for updating a prompt config
 */
export interface UpdatePromptConfig {
    /** New system prompt */
    systemPrompt?: string;
    /** New chunk strategy */
    chunkStrategy?: Partial<ChunkStrategy>;
    /** New name */
    name?: string;
    /** Change log / reason for update */
    changeLog?: string;
}

/**
 * Prompt config query filters
 */
export interface PromptConfigFilters {
    /** Filter by document type */
    documentType?: string;
    /** Only active configs */
    activeOnly?: boolean;
    /** Only default configs */
    defaultOnly?: boolean;
    /** Created by filter */
    createdBy?: string;
}

/**
 * Default chunk strategy
 */
export const DEFAULT_CHUNK_STRATEGY: ChunkStrategy = {
    maxTokens: 500,
    overlapTokens: 50,
    splitBy: 'semantic',
    preserveTables: true,
    preserveLists: true,
    extractHeadings: true,
};

/**
 * Default system prompt for document processing
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert document analyst. Extract meaningful content from the document while preserving its structure and context. Focus on:
- Key information and main concepts
- Tables and structured data
- Lists and enumerations  
- Important quotes and references
Format the output clearly with appropriate section markers.`;
