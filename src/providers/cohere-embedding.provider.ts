/* eslint-disable no-undef */
/**
 * Cohere Embedding Provider
 * 
 * Implementation of EmbeddingProvider for Cohere's embed models.
 * Supports embed-multilingual-v3.0 (1024 dim) - excellent for Turkish and other languages.
 * 
 * Note: Cohere has native input_type support similar to Gemini's taskType.
 */

import type {
    EmbeddingProvider,
    EmbeddingResult,
    EmbeddingTaskType,
} from '../types/embedding-provider.types.js';
import { RateLimitError, GeminiAPIError, ConfigurationError } from '../errors/index.js';
import type { Logger } from '../utils/logger.js';

/**
 * Cohere API response types
 */
interface CohereEmbedResponse {
    embeddings: number[][];
    meta?: {
        billed_units?: {
            input_tokens?: number;
        };
    };
}

/**
 * Cohere input types (native taskType support)
 */
type CohereInputType = 'search_document' | 'search_query' | 'classification' | 'clustering';

/**
 * Configuration for CohereEmbeddingProvider
 */
export interface CohereEmbeddingProviderConfig {
    apiKey: string;
    model?: string;
}

/**
 * Default dimensions for Cohere models
 */
const COHERE_DIMENSIONS: Record<string, number> = {
    'embed-multilingual-v3.0': 1024,
    'embed-english-v3.0': 1024,
    'embed-multilingual-light-v3.0': 384,
    'embed-english-light-v3.0': 384,
};

/**
 * Cohere embedding provider implementation
 * 
 * Uses native fetch API to avoid adding cohere-ai package dependency.
 */
export class CohereEmbeddingProvider implements EmbeddingProvider {
    readonly id: string;
    readonly dimension: number;
    readonly model: string;

    private readonly apiKey: string;
    private readonly logger: Logger;
    private readonly baseUrl = 'https://api.cohere.ai/v1';

    constructor(config: CohereEmbeddingProviderConfig, logger: Logger) {
        if (!config.apiKey) {
            throw new ConfigurationError('Cohere API key is required', { provider: 'cohere' });
        }

        this.model = config.model ?? 'embed-multilingual-v3.0';
        this.id = `cohere-${this.model}`;
        this.dimension = COHERE_DIMENSIONS[this.model] ?? 1024;
        this.apiKey = config.apiKey;
        this.logger = logger;

        this.logger.debug('CohereEmbeddingProvider initialized', {
            model: this.model,
            dimension: this.dimension,
        });
    }

    /**
     * Generate embedding for text with task type
     * 
     * Cohere supports native input_type which maps directly to our taskType.
     */
    async embed(text: string, taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddingResult> {
        const inputType = this.mapToInputType(taskType);

        try {
            const response = await fetch(`${this.baseUrl}/embed`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    texts: [text],
                    input_type: inputType,
                    embedding_types: ['float'],
                }),
            });

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data = await response.json() as CohereEmbedResponse;
            const embedding = data.embeddings[0];

            if (!embedding) {
                throw new Error('No embedding returned from Cohere API');
            }

            return {
                embedding,
                tokenCount: data.meta?.billed_units?.input_tokens ?? this.estimateTokenCount(text),
            };
        } catch (error) {
            if (error instanceof RateLimitError || error instanceof GeminiAPIError) {
                throw error;
            }
            this.logger.error('Cohere Embedding API error', { error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts: string[], taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT'): Promise<EmbeddingResult[]> {
        const inputType = this.mapToInputType(taskType);

        try {
            const response = await fetch(`${this.baseUrl}/embed`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    texts,
                    input_type: inputType,
                    embedding_types: ['float'],
                }),
            });

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const data = await response.json() as CohereEmbedResponse;
            const totalTokens = data.meta?.billed_units?.input_tokens ?? 0;
            const tokensPerText = Math.ceil(totalTokens / texts.length);

            return data.embeddings.map(embedding => ({
                embedding,
                tokenCount: tokensPerText,
            }));
        } catch (error) {
            if (error instanceof RateLimitError || error instanceof GeminiAPIError) {
                throw error;
            }
            this.logger.error('Cohere Embedding API error', { error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Embed a document for indexing
     */
    async embedDocument(text: string): Promise<EmbeddingResult> {
        return this.embed(text, 'RETRIEVAL_DOCUMENT');
    }

    /**
     * Embed a search query
     */
    async embedQuery(text: string): Promise<EmbeddingResult> {
        return this.embed(text, 'RETRIEVAL_QUERY');
    }

    /**
     * Map our taskType to Cohere's input_type
     * 
     * Cohere's input_type is very similar to Gemini's taskType,
     * making the mapping straightforward.
     */
    private mapToInputType(taskType?: EmbeddingTaskType): CohereInputType {
        switch (taskType) {
            case 'RETRIEVAL_DOCUMENT':
                return 'search_document';
            case 'RETRIEVAL_QUERY':
                return 'search_query';
            case 'CLASSIFICATION':
                return 'classification';
            case 'CLUSTERING':
                return 'clustering';
            case 'SEMANTIC_SIMILARITY':
            default:
                return 'search_document'; // Default to document embedding
        }
    }

    /**
     * Estimate token count from text
     */
    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Handle error responses from Cohere API
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        const errorText = await response.text();

        if (response.status === 429) {
            throw new RateLimitError('Cohere Embedding API rate limit exceeded');
        }

        if (response.status === 401) {
            throw new GeminiAPIError('Invalid Cohere API key', {
                statusCode: 401,
                retryable: false,
            });
        }

        if (response.status === 402) {
            throw new GeminiAPIError('Cohere API quota exceeded', {
                statusCode: 402,
                retryable: false,
            });
        }

        throw new GeminiAPIError(`Cohere API error: ${errorText}`, {
            statusCode: response.status,
            retryable: response.status >= 500,
        });
    }
}
