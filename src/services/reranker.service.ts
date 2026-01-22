/**
 * Reranker Service
 * 
 * Provides relevance-based reranking of search results.
 * Supports multiple providers: Gemini (default) and Cohere.
 */

import type { GeminiService } from './gemini.service.js';
import type { ResolvedConfig } from '../types/config.types.js';
import type { Logger } from '../utils/logger.js';
import { RerankingError } from '../errors/index.js';
import { z } from 'zod';
import { SEARCH_DEFAULTS } from '../config/constants.js';

/**
 * Document to be reranked
 */
export interface RerankDocument {
    id: string;
    content: string;
    originalRank: number;
    originalScore: number;
}

/**
 * Reranking result
 */
export interface RerankResult {
    id: string;
    relevanceScore: number;
    originalRank: number;
    reason?: string;
}

/**
 * Reranker service interface
 */
export interface RerankerService {
    rerank(query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]>;
}

/**
 * Gemini-based reranker response schema
 */
const GeminiRerankResponseSchema = z.array(z.object({
    id: z.string(),
    score: z.number().min(0).max(1),
    reason: z.string().optional(),
}));

/**
 * Gemini-based reranker (uses existing Gemini API)
 * 
 * Scores documents by relevance using LLM understanding.
 * No additional API key required - uses existing Gemini quota.
 */
export class GeminiReranker implements RerankerService {
    private readonly gemini: GeminiService;
    private readonly logger: Logger;

    constructor(gemini: GeminiService, logger: Logger) {
        this.gemini = gemini;
        this.logger = logger;
    }

    async rerank(query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]> {
        if (documents.length === 0) return [];
        if (documents.length <= topK) {
            // No need to rerank if we have fewer documents than topK
            return documents.map(d => ({
                id: d.id,
                relevanceScore: d.originalScore,
                originalRank: d.originalRank,
            }));
        }

        this.logger.debug('Gemini reranking started', {
            documentCount: documents.length,
            topK,
        });

        // Build prompt with documents - use index as ID for simplicity
        const snippetLength = SEARCH_DEFAULTS.RERANK_SNIPPET_LENGTH;
        const docsText = documents.map((doc, i) =>
            `[DOC_${i}] ${doc.content.substring(0, snippetLength)}${doc.content.length > snippetLength ? '...' : ''}`
        ).join('\n\n---\n\n');

        const prompt = `TASK: Score document relevance to query. Return ONLY JSON.

QUERY: "${query}"

DOCUMENTS:
${docsText}

INSTRUCTIONS:
1. Score each document 0.0 (irrelevant) to 1.0 (highly relevant)
2. Return ONLY a JSON array, no explanations
3. Use document IDs exactly as shown (DOC_0, DOC_1, etc.)

OUTPUT FORMAT (return EXACTLY this structure):
[{"id":"DOC_0","score":0.85},{"id":"DOC_1","score":0.72}]

JSON RESPONSE:`;

        try {
            const response = await this.gemini.generateForReranking(prompt);

            this.logger.debug('Gemini rerank raw response', {
                responseLength: response.length,
                responsePreview: response.substring(0, 200),
            });

            // Parse JSON response
            let parsed: Array<{ id: string; score: number; reason?: string }>;
            try {
                // Strip markdown code blocks if present (handle unclosed blocks too)
                let cleanResponse = response;

                // Try closed code block first
                const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                    cleanResponse = codeBlockMatch[1]!;
                } else {
                    // Handle unclosed code block (response truncated)
                    const openBlockMatch = response.match(/```(?:json)?\s*([\s\S]*)/);
                    if (openBlockMatch) {
                        cleanResponse = openBlockMatch[1]!;
                    }
                }

                // Try to extract complete JSON array
                let jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);

                if (!jsonMatch) {
                    // Try to repair truncated JSON by finding individual objects
                    const objectMatches = cleanResponse.match(/\{"id"\s*:\s*"DOC_\d+"\s*,\s*"score"\s*:\s*[\d.]+\s*\}/g);
                    if (objectMatches && objectMatches.length > 0) {
                        // Reconstruct valid JSON array from complete objects
                        const reconstructed = '[' + objectMatches.join(',') + ']';
                        const parseResult = GeminiRerankResponseSchema.parse(JSON.parse(reconstructed));
                        parsed = parseResult as Array<{ id: string; score: number; reason?: string }>;
                        this.logger.debug('Repaired truncated JSON response', {
                            originalObjects: objectMatches.length,
                        });
                    } else {
                        throw new RerankingError('No valid JSON found in Gemini response', 'gemini', {
                            retryable: true,
                            details: { responsePreview: response.substring(0, 200) },
                        });
                    }
                } else {
                    const parseResult = GeminiRerankResponseSchema.parse(JSON.parse(jsonMatch[0]));
                    parsed = parseResult as Array<{ id: string; score: number; reason?: string }>;
                }
            } catch (parseError) {
                this.logger.warn('Failed to parse rerank response, using original order', {
                    error: (parseError as Error).message,
                    responsePreview: response.substring(0, 300),
                });
                // Fallback to original scores
                return documents
                    .sort((a, b) => b.originalScore - a.originalScore)
                    .slice(0, topK)
                    .map(d => ({
                        id: d.id,
                        relevanceScore: d.originalScore,
                        originalRank: d.originalRank,
                    }));
            }

            // Map results back to documents using DOC_X -> index mapping
            const mappedResults: RerankResult[] = [];
            for (const p of parsed) {
                // Parse DOC_X format to get index
                const indexMatch = p.id.match(/DOC_(\d+)/);
                if (!indexMatch) continue;

                const index = parseInt(indexMatch[1]!, 10);
                if (index < 0 || index >= documents.length) continue;

                const doc = documents[index];
                if (!doc) continue;

                mappedResults.push({
                    id: doc.id,
                    relevanceScore: p.score,
                    originalRank: doc.originalRank,
                    reason: p.reason,
                });
            }

            const results = mappedResults
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, topK);

            this.logger.debug('Gemini reranking completed', {
                resultCount: results.length,
            });

            return results;
        } catch (error) {
            this.logger.error('Gemini reranking failed', {
                error: (error as Error).message,
            });
            // Fallback to original scores
            return documents
                .sort((a, b) => b.originalScore - a.originalScore)
                .slice(0, topK)
                .map(d => ({
                    id: d.id,
                    relevanceScore: d.originalScore,
                    originalRank: d.originalRank,
                }));
        }
    }
}

/**
 * Cohere reranker (requires Cohere API key)
 * 
 * Uses Cohere's specialized rerank model for best quality.
 * Free tier: 10,000 requests/month
 */
export class CohereReranker implements RerankerService {
    private readonly apiKey: string;
    private readonly logger: Logger;
    private readonly model: string = 'rerank-multilingual-v3.0';

    constructor(apiKey: string, logger: Logger) {
        this.apiKey = apiKey;
        this.logger = logger;
    }

    async rerank(query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]> {
        if (documents.length === 0) return [];

        this.logger.debug('Cohere reranking started', {
            documentCount: documents.length,
            topK,
        });

        try {
            // eslint-disable-next-line no-undef
            const response = await fetch('https://api.cohere.ai/v1/rerank', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    documents: documents.map(d => d.content),
                    top_n: topK,
                    model: this.model,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new RerankingError(`Cohere API error: ${response.status}`, 'cohere', {
                    retryable: response.status >= 500,
                    details: {
                        statusCode: response.status,
                        errorText: errorText.substring(0, 500),
                    },
                });
            }

            const data = await response.json() as {
                results: Array<{ index: number; relevance_score: number }>;
            };

            const results: RerankResult[] = data.results
                .filter(r => r.index >= 0 && r.index < documents.length)
                .map(r => {
                    const doc = documents[r.index]!;
                    return {
                        id: doc.id,
                        relevanceScore: r.relevance_score,
                        originalRank: doc.originalRank,
                    };
                });

            this.logger.debug('Cohere reranking completed', {
                resultCount: results.length,
            });

            return results;
        } catch (error) {
            this.logger.error('Cohere reranking failed', {
                error: (error as Error).message,
            });
            // Fallback to original scores
            return documents
                .sort((a, b) => b.originalScore - a.originalScore)
                .slice(0, topK)
                .map(d => ({
                    id: d.id,
                    relevanceScore: d.originalScore,
                    originalRank: d.originalRank,
                }));
        }
    }
}

/**
 * No-op reranker (for when reranking is disabled)
 */
export class NoOpReranker implements RerankerService {
    async rerank(_query: string, documents: RerankDocument[], topK: number): Promise<RerankResult[]> {
        return documents
            .sort((a, b) => b.originalScore - a.originalScore)
            .slice(0, topK)
            .map(d => ({
                id: d.id,
                relevanceScore: d.originalScore,
                originalRank: d.originalRank,
            }));
    }
}

/**
 * Factory function to create appropriate reranker based on config
 */
export function createReranker(
    config: ResolvedConfig,
    gemini: GeminiService,
    logger: Logger
): RerankerService {
    const rerankConfig = config.rerankingConfig;

    if (!rerankConfig?.enabled) {
        return new NoOpReranker();
    }

    switch (rerankConfig.provider) {
        case 'cohere':
            if (!rerankConfig.cohereApiKey) {
                logger.warn('Cohere API key not provided, falling back to Gemini reranker');
                return new GeminiReranker(gemini, logger);
            }
            return new CohereReranker(rerankConfig.cohereApiKey, logger);

        case 'gemini':
        default:
            return new GeminiReranker(gemini, logger);
    }
}
