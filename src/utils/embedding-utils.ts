/**
 * Embedding Utilities
 * 
 * Utilities for embedding model detection, mismatch checking, and metadata management.
 */

import type { PrismaClientLike } from '../types/config.types.js';
import type { EmbeddingProvider } from '../types/embedding-provider.types.js';
import type {
    MismatchResult,
    MismatchInfo,
    MismatchSeverity,
    EmbeddingModelStats,
} from '../types/migration.types.js';

/**
 * Detect embedding model mismatch between config and database
 * 
 * @param prisma - Prisma client instance
 * @param currentProvider - Currently configured embedding provider
 * @returns Mismatch info if there's a problem, null if everything matches
 */
export async function detectEmbeddingMismatch(
    prisma: PrismaClientLike,
    currentProvider: EmbeddingProvider
): Promise<MismatchInfo | null> {
    const result = await checkEmbeddingMismatch(prisma, currentProvider);

    if (!result.hasMismatch) {
        return null;
    }

    const severity = determineSeverity(result);
    const message = buildMismatchMessage(result, severity);

    return {
        severity,
        message,
        details: result,
        action: severity === 'critical' ? 'reindex-required' : 'reindex',
    };
}

/**
 * Check for embedding model mismatch
 */
export async function checkEmbeddingMismatch(
    prisma: PrismaClientLike,
    currentProvider: EmbeddingProvider
): Promise<MismatchResult> {
    // Get model statistics from database
    const stats = await getEmbeddingModelStats(prisma);

    // Get total chunk count
    const totalChunks = await prisma.contextRagChunk.count();

    // Calculate chunks that need migration
    let chunksToMigrate = 0;
    for (const stat of stats) {
        // Chunks with different model or null model need migration
        if (stat.model !== currentProvider.id) {
            chunksToMigrate += stat.count;
        }
    }

    const hasMismatch = chunksToMigrate > 0;

    return {
        hasMismatch,
        currentModel: currentProvider.id,
        currentProvider: extractProviderType(currentProvider.id),
        currentDimension: currentProvider.dimension,
        existingModels: stats,
        chunksToMigrate,
        totalChunks,
    };
}

/**
 * Get statistics about embedding models in the database
 */
export async function getEmbeddingModelStats(
    prisma: PrismaClientLike
): Promise<EmbeddingModelStats[]> {
    // Use raw query for GROUP BY with null handling
    const results = await prisma.$queryRaw<Array<{
        embedding_model: string | null;
        embedding_dimension: number | null;
        count: bigint;
    }>>`
        SELECT 
            embedding_model,
            embedding_dimension,
            COUNT(*) as count
        FROM context_rag_chunks
        GROUP BY embedding_model, embedding_dimension
        ORDER BY count DESC
    `;

    return results.map(r => ({
        model: r.embedding_model,
        dimension: r.embedding_dimension,
        count: Number(r.count),
    }));
}

/**
 * Determine severity of mismatch
 */
function determineSeverity(result: MismatchResult): MismatchSeverity {
    if (!result.hasMismatch) {
        return 'none';
    }

    // Check if there are dimension mismatches (critical)
    for (const stat of result.existingModels) {
        if (stat.dimension !== null && stat.dimension !== result.currentDimension) {
            return 'critical';
        }
    }

    // Check percentage of mismatched chunks
    const mismatchPercentage = (result.chunksToMigrate / result.totalChunks) * 100;

    if (mismatchPercentage > 50) {
        return 'critical';
    }

    return 'warning';
}

/**
 * Build user-friendly mismatch message
 */
function buildMismatchMessage(result: MismatchResult, severity: MismatchSeverity): string {
    const percentage = Math.round((result.chunksToMigrate / result.totalChunks) * 100);

    if (severity === 'critical') {
        return `⚠️ CRITICAL: ${result.chunksToMigrate} chunks (${percentage}%) were created with different embedding models. ` +
            `Current: ${result.currentModel} (${result.currentDimension}d). ` +
            `Search results may be inaccurate. Run 'npx context-rag reindex' to fix.`;
    }

    return `⚡ Warning: ${result.chunksToMigrate} chunks (${percentage}%) may have outdated embeddings. ` +
        `Current model: ${result.currentModel}. ` +
        `Consider running 'npx context-rag reindex' for optimal results.`;
}

/**
 * Extract provider type from model ID
 */
function extractProviderType(modelId: string): 'gemini' | 'openai' | 'cohere' {
    if (modelId.startsWith('gemini')) return 'gemini';
    if (modelId.startsWith('openai') || modelId.includes('text-embedding')) return 'openai';
    if (modelId.startsWith('cohere') || modelId.includes('embed-')) return 'cohere';
    return 'gemini'; // default
}

/**
 * Build embedding model identifier from provider and model name
 */
export function buildEmbeddingModelId(provider: string, model: string): string {
    return `${provider}-${model}`;
}
