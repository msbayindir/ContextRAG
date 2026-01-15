import type { PrismaClientLike } from '../types/config.types.js';
import { DatabaseError } from '../errors/index.js';

/**
 * Check if pgvector extension is installed in the database
 */
export async function checkPgVectorExtension(prisma: PrismaClientLike): Promise<boolean> {
    try {
        const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as exists
    `;

        return (result as Array<{ exists: boolean }>)[0]?.exists ?? false;
    } catch (error) {
        throw new DatabaseError('Failed to check pgvector extension', {
            error: (error as Error).message,
        });
    }
}

/**
 * Install pgvector extension (requires superuser privileges)
 */
export async function installPgVectorExtension(prisma: PrismaClientLike): Promise<void> {
    try {
        await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    } catch (error) {
        throw new DatabaseError(
            'Failed to install pgvector extension. Make sure you have superuser privileges.',
            { error: (error as Error).message }
        );
    }
}

/**
 * Check database connection
 */
export async function checkDatabaseConnection(prisma: PrismaClientLike): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

/**
 * Get database statistics for Context-RAG tables
 */
export async function getDatabaseStats(prisma: PrismaClientLike): Promise<{
    documents: number;
    chunks: number;
    promptConfigs: number;
    batches: number;
    totalStorageBytes: number;
}> {
    try {
        const [documents, chunks, promptConfigs, batches] = await Promise.all([
            prisma.contextRagDocument.count(),
            prisma.contextRagChunk.count(),
            prisma.contextRagPromptConfig.count(),
            prisma.contextRagBatch.count(),
        ]);

        // Get storage size
        const storageResult = await prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(pg_total_relation_size(quote_ident(tablename)::regclass)), 0) as total_bytes
      FROM pg_tables
      WHERE tablename LIKE 'context_rag_%'
    `;

        const totalStorageBytes = Number((storageResult as Array<{ total_bytes: bigint }>)[0]?.total_bytes ?? 0);

        return {
            documents,
            chunks,
            promptConfigs,
            batches,
            totalStorageBytes,
        };
    } catch (error) {
        throw new DatabaseError('Failed to get database stats', {
            error: (error as Error).message,
        });
    }
}

/**
 * Vacuum and analyze Context-RAG tables for performance
 */
export async function optimizeTables(prisma: PrismaClientLike): Promise<void> {
    try {
        await prisma.$executeRaw`VACUUM ANALYZE context_rag_chunks`;
        await prisma.$executeRaw`VACUUM ANALYZE context_rag_documents`;
        await prisma.$executeRaw`VACUUM ANALYZE context_rag_batches`;
        await prisma.$executeRaw`VACUUM ANALYZE context_rag_prompt_configs`;
    } catch (error) {
        throw new DatabaseError('Failed to optimize tables', {
            error: (error as Error).message,
        });
    }
}
