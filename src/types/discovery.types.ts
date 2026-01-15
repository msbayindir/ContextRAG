import type { ChunkStrategy } from './chunk.types.js';

/**
 * Discovery options
 */
export interface DiscoveryOptions {
    /** PDF file as buffer or file path */
    file: Buffer | string;
    /** Hint about expected document type */
    documentTypeHint?: string;
    /** Generate sample output for preview */
    generateSample?: boolean;
    /** Number of sample pages to analyze (default: 5) */
    samplePages?: number;
}

/**
 * Detected document element
 */
export interface DetectedElement {
    type: 'table' | 'list' | 'code' | 'image' | 'chart' | 'form' | 'heading';
    count: number;
    /** Example locations (page numbers) */
    examples?: number[];
}

/**
 * Discovery result from AI analysis
 */
export interface DiscoveryResult {
    /** Unique ID for this discovery session */
    id: string;
    /** Detected document type */
    documentType: string;
    /** Human-readable document type name */
    documentTypeName: string;
    /** Detected structural elements */
    detectedElements: DetectedElement[];
    /** AI-generated system prompt for ingestion */
    suggestedPrompt: string;
    /** Suggested chunking strategy */
    suggestedChunkStrategy: ChunkStrategy;
    /** AI confidence in this analysis (0.0 - 1.0) */
    confidence: number;
    /** Sample output if requested */
    sampleOutput?: string;
    /** Analysis reasoning */
    reasoning: string;
    /** Total pages in document */
    pageCount: number;
    /** File hash for idempotency */
    fileHash: string;
    /** Timestamps */
    createdAt: Date;
    expiresAt: Date;
}

/**
 * Strategy approval options
 */
export interface ApproveStrategyOptions {
    /** Override the suggested prompt */
    systemPrompt?: string;
    /** Override document type */
    documentType?: string;
    /** Override chunk strategy */
    chunkStrategy?: Partial<ChunkStrategy>;
    /** Custom name for this config */
    name?: string;
    /** Change log / reason for modifications */
    changeLog?: string;
}

/**
 * Discovery session storage (in-memory or DB based on config)
 */
export interface DiscoverySession {
    id: string;
    result: DiscoveryResult;
    fileBuffer: Buffer;
    createdAt: Date;
    expiresAt: Date;
}
