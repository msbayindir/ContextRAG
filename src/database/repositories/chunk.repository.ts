import type { PrismaClientLike } from '../../types/config.types.js';
import type { VectorChunk, CreateChunkInput, ChunkType } from '../../types/chunk.types.js';
import type { SearchFilters } from '../../types/search.types.js';
import { DatabaseError } from '../../errors/index.js';

interface ChunkSearchResult {
    chunk: VectorChunk;
    similarity: number;
}

/**
 * Repository for Chunk CRUD and search operations
 */
export class ChunkRepository {
    constructor(private readonly prisma: PrismaClientLike) { }

    /**
     * Create a single chunk with embedding
     */
    async create(input: CreateChunkInput, embedding: number[]): Promise<string> {
        try {
            // Use raw query for vector insertion
            const result = await this.prisma.$queryRaw`
        INSERT INTO context_rag_chunks (
          id, prompt_config_id, document_id, chunk_index, chunk_type,
          search_content, enriched_content, context_text, search_vector, display_content,
          source_page_start, source_page_end, confidence_score, metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          ${input.promptConfigId},
          ${input.documentId},
          ${input.chunkIndex},
          ${input.chunkType},
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
            id, prompt_config_id, document_id, chunk_index, chunk_type,
            search_content, enriched_content, context_text, search_vector, display_content,
            source_page_start, source_page_end, confidence_score, metadata, created_at
          ) VALUES (
            gen_random_uuid(),
            ${input.promptConfigId},
            ${input.documentId},
            ${input.chunkIndex},
            ${input.chunkType},
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
            `to_tsvector('english', c.search_content) @@ plainto_tsquery('english', $1)`
        ];
        const params: unknown[] = [query, limit];
        let paramIndex = 3;

        // Build filter conditions (same as semantic)
        if (filters?.chunkTypes?.length) {
            whereConditions.push(`c.chunk_type = ANY($${paramIndex})`);
            params.push(filters.chunkTypes);
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
        c.search_content, c.display_content,
        c.source_page_start, c.source_page_end, c.confidence_score,
        c.metadata, c.created_at,
        ts_rank(to_tsvector('english', c.search_content), plainto_tsquery('english', $1)) as similarity
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
     */
    async getByDocumentId(documentId: string): Promise<VectorChunk[]> {
        const chunks = await this.prisma.contextRagChunk.findMany({
            where: { documentId },
            orderBy: { chunkIndex: 'asc' },
        });

        return chunks.map((c: Record<string, unknown>) => this.mapToVectorChunk(c));
    }

    /**
     * Delete chunks by document ID
     */
    async deleteByDocumentId(documentId: string): Promise<number> {
        const result = await this.prisma.contextRagChunk.deleteMany({
            where: { documentId },
        });

        return result.count;
    }

    /**
     * Count chunks by document ID
     */
    async countByDocumentId(documentId: string): Promise<number> {
        return await this.prisma.contextRagChunk.count({
            where: { documentId },
        });
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
