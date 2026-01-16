/**
 * Chunk type enumeration
 * Defines the type of content within a chunk
 */
export const ChunkTypeEnum = {
    TEXT: 'TEXT',
    TABLE: 'TABLE',
    LIST: 'LIST',
    CODE: 'CODE',
    HEADING: 'HEADING',
    IMAGE_REF: 'IMAGE_REF',
    QUOTE: 'QUOTE',
    QUESTION: 'QUESTION',
    MIXED: 'MIXED',
} as const;

export type ChunkTypeEnumType = (typeof ChunkTypeEnum)[keyof typeof ChunkTypeEnum];

/**
 * Batch processing status enumeration
 */
export const BatchStatusEnum = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    RETRYING: 'RETRYING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
} as const;

export type BatchStatusEnumType = (typeof BatchStatusEnum)[keyof typeof BatchStatusEnum];

/**
 * Document processing status enumeration
 */
export const DocumentStatusEnum = {
    PENDING: 'PENDING',
    DISCOVERING: 'DISCOVERING',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    PARTIAL: 'PARTIAL',
} as const;

export type DocumentStatusEnumType = (typeof DocumentStatusEnum)[keyof typeof DocumentStatusEnum];

/**
 * Confidence level enumeration
 */
export const ConfidenceLevelEnum = {
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW',
} as const;

export type ConfidenceLevelEnumType = (typeof ConfidenceLevelEnum)[keyof typeof ConfidenceLevelEnum];

/**
 * Search mode enumeration
 */
export const SearchModeEnum = {
    SEMANTIC: 'semantic',
    KEYWORD: 'keyword',
    HYBRID: 'hybrid',
} as const;

export type SearchModeEnumType = (typeof SearchModeEnum)[keyof typeof SearchModeEnum];
