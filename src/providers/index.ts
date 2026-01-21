/**
 * Providers Module
 * 
 * Exports all provider implementations and factories.
 */

// Embedding providers
export { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';
export { createEmbeddingProvider, getEmbeddingDimension } from './embedding-provider.factory.js';

// Re-export types for convenience
export type {
    EmbeddingProvider,
    EmbeddingResult,
    EmbeddingTaskType,
    EmbeddingProviderType,
    EmbeddingProviderConfig,
    GeminiEmbeddingConfig,
    OpenAIEmbeddingConfig,
    CohereEmbeddingConfig,
} from '../types/embedding-provider.types.js';
