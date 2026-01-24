import type { PrismaClientLike } from '../../types/config.types.js';
import type { VectorChunk, CreateChunkInput, ChunkType } from '../../types/chunk.types.js';
import type { SearchFilters } from '../../types/search.types.js';
import type { IChunkRepository, ChunkSearchResult } from '../../types/repository.types.js';
import { DatabaseError } from '../../errors/index.js';

// Re-export types for backward compatibility
export type { ChunkSearchResult };

/**
 * Repository for Chunk CRUD and search operations
 * 
 * Implements IChunkRepository interface for dependency injection.
 * 
 * @implements {IChunkRepository}
 */
export class ChunkRepository implements IChunkRepository {
    constructor(private readonly prisma: PrismaClientLike) { }

    /**
     * Create a single chunk with embedding
     */
    async create(input: CreateChunkInput, embedding: number[]): Promise<string> {
        try {
            // Use raw query for vector insertion
            const result = await this.prisma.$queryRaw`
        INSERT INTO context_rag_chunks (
          id, prompt_config_id, document_id, chunk_index, chunk_type, sub_type, domain,
          search_content, enriched_content, context_text, search_vector, display_content,
          source_page_start, source_page_end, confidence_score, metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          ${input.promptConfigId},
          ${input.documentId},
          ${input.chunkIndex},
          ${input.chunkType},
          ${input.subType ?? null},
          ${input.domain ?? null},
          ${input.searchContent},
          ${input.enrichedContent ?? null},
          ${input.contextText ?? null},
          ${embedding}::vector,
          ${input.displayContent},
          ${input.sourcePageStart},
          ${input.sourcePageEnd},
          ${input.confidenceScore},
          ${JSON.stringify(input.metadata)}::jsonb,
          NOW()
        )
        RETURNING id
      `;

            return (result as Array<{ id: string }>)[0]?.id ?? '';
        } catch (error) {
            throw new DatabaseError('Failed to create chunk', {
                error: (error as Error).message,
            });
        }
    }

    /**
     * Create multiple chunks with embeddings
     */
    async createMany(
        inputs: CreateChunkInput[],
        embeddings: number[][]
    ): Promise<string[]> {
        const ids: string[] = [];

        // Process in transaction
        await this.prisma.$transaction(async (tx: PrismaClientLike) => {
            for (let i = 0; i < inputs.length; i++) {
                const input = inputs[i];
                const embedding = embeddings[i];

                if (!input || !embedding) continue;

                const result = await tx.$queryRaw`
          INSERT INTO context_rag_chunks (
            id, prompt_config_id, document_id, chunk_index, chunk_type, sub_type, domain,
            search_content, enriched_content, context_text, search_vector, display_content,
            source_page_start, source_page_end, confidence_score, metadata, created_at
          ) VALUES (
            gen_random_uuid(),
            ${input.promptConfigId},
            ${input.documentId},
            ${input.chunkIndex},
            ${input.chunkType},
            ${input.subType ?? null},
            ${input.domain ?? null},
            ${input.searchContent},
            ${input.enrichedContent ?? null},
            ${input.contextText ?? null},
            ${embedding}::vector,
            ${input.displayContent},
            ${input.sourcePageStart},
            ${input.sourcePageEnd},
            ${input.confidenceScore},
            ${JSON.stringify(input.metadata)}::jsonb,
            NOW()
          )
          RETURNING id
        `;

                const id = (result as Array<{ id: string }>)[0]?.id;
                if (id) ids.push(id);
            }
        });

        return ids;
    }

    /**
     * Vector similarity search
     */
    async searchSemantic(
        queryEmbedding: number[],
        limit: number,
        filters?: SearchFilters,
        minScore?: number
    ): Promise<ChunkSearchResult[]> {
        const whereConditions: string[] = [];
        const params: unknown[] = [queryEmbedding, limit];
        let paramIndex = 3;

        // Build filter conditions
        if (filters?.documentTypes?.length) {
            whereConditions.push(`c.document_id IN (
        SELECT id FROM context_rag_documents WHERE document_type = ANY($${paramIndex})
      )`);
            params.push(filters.documentTypes);
            paramIndex++;
        }

        if (filters?.chunkTypes?.length) {
            whereConditions.push(`c.chunk_type = ANY($${paramIndex})`);
            params.push(filters.chunkTypes);
            paramIndex++;
        }

        // Filter by custom sub-types (e.g., CLAUSE, MEDICATION, DEFINITION)
        if (filters?.subTypes?.length) {
            whereConditions.push(`c.sub_type = ANY($${paramIndex})`);
            params.push(filters.subTypes);
            paramIndex++;
        }

        // Filter by domain (e.g., legal, medical, educational)
        if (filters?.domains?.length) {
            whereConditions.push(`c.domain = ANY($${paramIndex})`);
            params.push(filters.domains);
            paramIndex++;
        }

        if (filters?.minConfidence !== undefined) {
            whereConditions.push(`c.confidence_score >= $${paramIndex}`);
            params.push(filters.minConfidence);
            paramIndex++;
        }

        if (filters?.documentIds?.length) {
            whereConditions.push(`c.document_id = ANY($${paramIndex})`);
            params.push(filters.documentIds);
            paramIndex++;
        }

        if (filters?.promptConfigIds?.length) {
            whereConditions.push(`c.prompt_config_id = ANY($${paramIndex})`);
            params.push(filters.promptConfigIds);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const scoreThreshold = minScore !== undefined
            ? `HAVING 1 - (c.search_vector <=> $1::vector) >= ${minScore}`
            : '';

        const query = `
      SELECT 
        c.id, c.prompt_config_id, c.document_id, c.chunk_index, c.chunk_type,
        c.sub_type, c.domain,
        c.search_content, c.display_content,
        c.source_page_start, c.source_page_end, c.confidence_score,
        c.metadata, c.created_at,
        1 - (c.search_vector <=> $1::vector) as similarity
      FROM context_rag_chunks c
      ${whereClause}
      GROUP BY c.id
      ${scoreThreshold}
      ORDER BY c.search_vector <=> $1::vector
      LIMIT $2
    `;

        const results = await this.prisma.$queryRawUnsafe(query, ...params);

        return (results as Array<Record<string, unknown>>).map(row => ({
            chunk: this.mapToVectorChunk(row),
            similarity: row['similarity'] as number,
        }));
    }

    /**
     * Full-text keyword search
     */
    async searchKeyword(
        query: string,
        limit: number,
        filters?: SearchFilters
    ): Promise<ChunkSearchResult[]> {
        const whereConditions: string[] = [
            `to_tsvector('simple', c.search_content) @@ plainto_tsquery('simple', $1)`
        ];
        const params: unknown[] = [query, limit];
        let paramIndex = 3;

        // Build filter conditions (same as semantic)
        if (filters?.chunkTypes?.length) {
            whereConditions.push(`c.chunk_type = ANY($${paramIndex})`);
            params.push(filters.chunkTypes);
            paramIndex++;
        }

        // Filter by custom sub-types (e.g., CLAUSE, MEDICATION, DEFINITION)
        if (filters?.subTypes?.length) {
            whereConditions.push(`c.sub_type = ANY($${paramIndex})`);
            params.push(filters.subTypes);
            paramIndex++;
        }

        // Filter by domain (e.g., legal, medical, educational)
        if (filters?.domains?.length) {
            whereConditions.push(`c.domain = ANY($${paramIndex})`);
            params.push(filters.domains);
            paramIndex++;
        }

        if (filters?.documentIds?.length) {
            whereConditions.push(`c.document_id = ANY($${paramIndex})`);
            params.push(filters.documentIds);
            paramIndex++;
        }

        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

        const queryStr = `
      SELECT 
        c.id, c.prompt_config_id, c.document_id, c.chunk_index, c.chunk_type,
        c.sub_type, c.domain,
        c.search_content, c.display_content,
        c.source_page_start, c.source_page_end, c.confidence_score,
        c.metadata, c.created_at,
        ts_rank(to_tsvector('simple', c.search_content), plainto_tsquery('simple', $1)) as similarity
      FROM context_rag_chunks c
      ${whereClause}
      ORDER BY similarity DESC
      LIMIT $2
    `;

        const results = await this.prisma.$queryRawUnsafe(queryStr, ...params);

        return (results as Array<Record<string, unknown>>).map(row => ({
            chunk: this.mapToVectorChunk(row),
            similarity: row['similarity'] as number,
        }));
    }

    /**
     * Get chunks by document ID
     * @implements IChunkRepository.getByDocumentId
     */
    async getByDocumentId(documentId: string): Promise<VectorChunk[]> {
        const chunks = await this.prisma.contextRagChunk.findMany({
            where: { documentId },
            orderBy: { chunkIndex: 'asc' },
        });

        return chunks.map((c: Record<string, unknown>) => this.mapToVectorChunk(c));
    }

    /**
     * Get chunks by type
     * @implements IChunkRepository.getByType
     */
    async getByType(documentId: string, chunkType: ChunkType): Promise<VectorChunk[]> {
        const chunks = await this.prisma.contextRagChunk.findMany({
            where: { documentId, chunkType },
            orderBy: { chunkIndex: 'asc' },
        });

        return chunks.map((c: Record<string, unknown>) => this.mapToVectorChunk(c));
    }

    /**
     * Delete chunks by document ID
     * @implements IChunkRepository.deleteByDocument
     */
    async deleteByDocument(documentId: string): Promise<number> {
        const result = await this.prisma.contextRagChunk.deleteMany({
            where: { documentId },
        });

        return result.count;
    }

    /**
     * @deprecated Use deleteByDocument instead
     */
    async deleteByDocumentId(documentId: string): Promise<number> {
        return this.deleteByDocument(documentId);
    }

    /**
     * Count chunks by document ID
     * @implements IChunkRepository.countByDocument
     */
    async countByDocument(documentId: string): Promise<number> {
        return await this.prisma.contextRagChunk.count({
            where: { documentId },
        });
    }

    /**
     * @deprecated Use countByDocument instead
     */
    async countByDocumentId(documentId: string): Promise<number> {
        return this.countByDocument(documentId);
    }

    /**
     * Map database record to VectorChunk type
     */
    private mapToVectorChunk(record: Record<string, unknown>): VectorChunk {
        return {
            id: record['id'] as string,
            promptConfigId: (record['prompt_config_id'] ?? record['promptConfigId']) as string,
            documentId: (record['document_id'] ?? record['documentId']) as string,
            chunkIndex: (record['chunk_index'] ?? record['chunkIndex']) as number,
            chunkType: (record['chunk_type'] ?? record['chunkType']) as ChunkType,
            subType: (record['sub_type'] ?? record['subType']) as string | undefined,
            domain: record['domain'] as string | undefined,
            searchContent: (record['search_content'] ?? record['searchContent']) as string,
            displayContent: (record['display_content'] ?? record['displayContent']) as string,
            sourcePageStart: (record['source_page_start'] ?? record['sourcePageStart']) as number,
            sourcePageEnd: (record['source_page_end'] ?? record['sourcePageEnd']) as number,
            confidenceScore: (record['confidence_score'] ?? record['confidenceScore']) as number,
            metadata: record['metadata'] as VectorChunk['metadata'],
            createdAt: (record['created_at'] ?? record['createdAt']) as Date,
        };
    }
}
