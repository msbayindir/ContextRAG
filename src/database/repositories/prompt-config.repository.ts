import type { PrismaClientLike } from '../types/config.types.js';
import type {
    PromptConfig,
    CreatePromptConfig,
    PromptConfigFilters,
} from '../types/prompt.types.js';
import type { ChunkStrategy } from '../types/chunk.types.js';
import { DEFAULT_CHUNK_STRATEGY } from '../types/prompt.types.js';
import { DatabaseError, NotFoundError } from '../errors/index.js';

/**
 * Repository for PromptConfig CRUD operations
 */
export class PromptConfigRepository {
    constructor(private readonly prisma: PrismaClientLike) { }

    /**
     * Create a new prompt configuration
     */
    async create(input: CreatePromptConfig): Promise<PromptConfig> {
        try {
            // Get the next version number for this document type
            const latestVersion = await this.prisma.contextRagPromptConfig.findFirst({
                where: { documentType: input.documentType },
                orderBy: { version: 'desc' },
                select: { version: true },
            });

            const version = (latestVersion?.version ?? 0) + 1;

            // If setting as default, unset other defaults first
            if (input.setAsDefault) {
                await this.prisma.contextRagPromptConfig.updateMany({
                    where: { documentType: input.documentType, isDefault: true },
                    data: { isDefault: false },
                });
            }

            // Merge chunk strategy with defaults
            const chunkStrategy: ChunkStrategy = {
                ...DEFAULT_CHUNK_STRATEGY,
                ...input.chunkStrategy,
            };

            const created = await this.prisma.contextRagPromptConfig.create({
                data: {
                    documentType: input.documentType,
                    name: input.name,
                    systemPrompt: input.systemPrompt,
                    chunkStrategy,
                    version,
                    isActive: true,
                    isDefault: input.setAsDefault ?? false,
                    createdBy: 'manual',
                    changeLog: input.changeLog,
                },
            });

            return this.mapToPromptConfig(created);
        } catch (error) {
            throw new DatabaseError('Failed to create prompt config', {
                error: (error as Error).message,
                documentType: input.documentType,
            });
        }
    }

    /**
     * Get a prompt configuration by ID
     */
    async getById(id: string): Promise<PromptConfig> {
        const config = await this.prisma.contextRagPromptConfig.findUnique({
            where: { id },
        });

        if (!config) {
            throw new NotFoundError('PromptConfig', id);
        }

        return this.mapToPromptConfig(config);
    }

    /**
     * Get prompt configurations with optional filters
     */
    async getMany(filters?: PromptConfigFilters): Promise<PromptConfig[]> {
        const where: Record<string, unknown> = {};

        if (filters?.documentType) {
            where['documentType'] = filters.documentType;
        }
        if (filters?.activeOnly) {
            where['isActive'] = true;
        }
        if (filters?.defaultOnly) {
            where['isDefault'] = true;
        }
        if (filters?.createdBy) {
            where['createdBy'] = filters.createdBy;
        }

        const configs = await this.prisma.contextRagPromptConfig.findMany({
            where,
            orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
        });

        return configs.map((c: Record<string, unknown>) => this.mapToPromptConfig(c));
    }

    /**
     * Get the active default config for a document type
     */
    async getDefault(documentType: string): Promise<PromptConfig | null> {
        const config = await this.prisma.contextRagPromptConfig.findFirst({
            where: {
                documentType,
                isActive: true,
                isDefault: true,
            },
        });

        return config ? this.mapToPromptConfig(config) : null;
    }

    /**
     * Get the latest active config for a document type
     */
    async getLatest(documentType: string): Promise<PromptConfig | null> {
        const config = await this.prisma.contextRagPromptConfig.findFirst({
            where: {
                documentType,
                isActive: true,
            },
            orderBy: { version: 'desc' },
        });

        return config ? this.mapToPromptConfig(config) : null;
    }

    /**
     * Activate a specific config version
     */
    async activate(id: string): Promise<void> {
        const config = await this.prisma.contextRagPromptConfig.findUnique({
            where: { id },
        });

        if (!config) {
            throw new NotFoundError('PromptConfig', id);
        }

        // Deactivate all other versions of this document type
        await this.prisma.contextRagPromptConfig.updateMany({
            where: {
                documentType: config.documentType,
                id: { not: id },
            },
            data: { isActive: false, isDefault: false },
        });

        // Activate and set as default
        await this.prisma.contextRagPromptConfig.update({
            where: { id },
            data: { isActive: true, isDefault: true },
        });
    }

    /**
     * Deactivate a config
     */
    async deactivate(id: string): Promise<void> {
        await this.prisma.contextRagPromptConfig.update({
            where: { id },
            data: { isActive: false, isDefault: false },
        });
    }

    /**
     * Delete a config (only if no chunks reference it)
     */
    async delete(id: string): Promise<void> {
        const chunkCount = await this.prisma.contextRagChunk.count({
            where: { promptConfigId: id },
        });

        if (chunkCount > 0) {
            throw new DatabaseError('Cannot delete prompt config with existing chunks', {
                id,
                chunkCount,
            });
        }

        await this.prisma.contextRagPromptConfig.delete({
            where: { id },
        });
    }

    /**
     * Map database record to PromptConfig type
     */
    private mapToPromptConfig(record: Record<string, unknown>): PromptConfig {
        return {
            id: record['id'] as string,
            documentType: record['documentType'] as string,
            name: record['name'] as string,
            systemPrompt: record['systemPrompt'] as string,
            chunkStrategy: record['chunkStrategy'] as ChunkStrategy,
            version: record['version'] as number,
            isActive: record['isActive'] as boolean,
            isDefault: record['isDefault'] as boolean,
            createdBy: record['createdBy'] as string | undefined,
            changeLog: record['changeLog'] as string | undefined,
            createdAt: record['createdAt'] as Date,
            updatedAt: record['updatedAt'] as Date,
        };
    }
}
