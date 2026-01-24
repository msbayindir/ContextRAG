#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { EmbeddingProviderType } from '../types/embedding-provider.types.js';
import type { EmbeddingProviderConfig } from '../types/embedding-provider.types.js';
import type { ResolvedConfig } from '../types/config.types.js';
import {
    DEFAULT_BATCH_CONFIG,
    DEFAULT_CHUNK_CONFIG,
    DEFAULT_EMBEDDING_CONFIG,
    DEFAULT_GENERATION_CONFIG,
    DEFAULT_LOG_CONFIG,
    DEFAULT_RATE_LIMIT_CONFIG,
    DEFAULT_RERANKING_CONFIG,
    DEFAULT_LLM_PROVIDER,
} from '../types/config.types.js';
import { createEmbeddingProvider } from '../providers/embedding-provider.factory.js';
import { MigrationService } from '../services/migration.service.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { createLogger } from '../utils/logger.js';
import pkg from '../../package.json' with { type: 'json' };

const program = new Command();

program
    .name('context-rag')
    .description('Context-RAG CLI - Setup and management tools')
    .version(pkg.version ?? '0.0.0');

function getGeminiApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required for this command.');
    }
    return apiKey;
}

function buildResolvedConfig(geminiApiKey: string, embeddingModel?: string): ResolvedConfig {
    return {
        prisma: {} as ResolvedConfig['prisma'],
        geminiApiKey,
        model: 'gemini-2.5-flash',
        embeddingModel: embeddingModel ?? DEFAULT_EMBEDDING_CONFIG.model ?? 'text-embedding-004',
        generationConfig: DEFAULT_GENERATION_CONFIG,
        batchConfig: DEFAULT_BATCH_CONFIG,
        chunkConfig: DEFAULT_CHUNK_CONFIG,
        rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
        logging: { ...DEFAULT_LOG_CONFIG, structured: false },
        useStructuredOutput: true,
        rerankingConfig: DEFAULT_RERANKING_CONFIG,
        llmProvider: DEFAULT_LLM_PROVIDER,
        documentProvider: DEFAULT_LLM_PROVIDER,
    };
}

function normalizeProvider(provider?: string): EmbeddingProviderType {
    const normalized = (provider ?? 'gemini').toLowerCase();
    if (normalized === 'gemini' || normalized === 'openai' || normalized === 'cohere') {
        return normalized;
    }
    throw new Error(`Unknown embedding provider: ${provider}`);
}

async function createMigrationService(options: {
    provider?: EmbeddingProviderType;
    model?: string;
    apiKey?: string;
    databaseUrl?: string;
}): Promise<{ prisma: PrismaClient; migrationService: MigrationService }> {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required for this command.');
    }

    const provider = options.provider ?? 'gemini';
    const geminiApiKey = provider === 'gemini'
        ? options.apiKey ?? getGeminiApiKey()
        : process.env.GEMINI_API_KEY ?? '';

    const resolvedConfig = buildResolvedConfig(geminiApiKey, options.model);
    const logger = createLogger(resolvedConfig.logging);
    const rateLimiter = new RateLimiter(resolvedConfig.rateLimitConfig);

    const providerConfig: EmbeddingProviderConfig = {
        provider,
        apiKey: options.apiKey,
        model: options.model,
    };

    const embeddingProvider = createEmbeddingProvider(
        resolvedConfig,
        rateLimiter,
        logger,
        providerConfig
    );

    const prisma = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
    });

    const migrationService = new MigrationService(
        prisma,
        embeddingProvider,
        resolvedConfig,
        logger
    );

    return { prisma, migrationService };
}

program
    .command('init')
    .description('Initialize Context-RAG in your project')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (options) => {
        console.log('Initializing Context-RAG...\\n');

        try {
            // Check if prisma directory exists
            const prismaDir = path.join(process.cwd(), 'prisma');
            const schemaPath = path.join(prismaDir, 'schema.prisma');

            let schemaExists = false;
            try {
                await fs.access(schemaPath);
                schemaExists = true;
            } catch {
                schemaExists = false;
            }

            if (!schemaExists) {
                console.log('Error: Prisma schema not found at prisma/schema.prisma');
                console.log('   Please run `npx prisma init` first.\n');
                process.exit(1);
            }

            // Read existing schema
            const existingSchema = await fs.readFile(schemaPath, 'utf-8');

            // Check if Context-RAG models already exist
            if (existingSchema.includes('ContextRagChunk') && !options.force) {
                console.log('Warning: Context-RAG models already exist in schema.');
                console.log('   Use --force to overwrite.\n');
                process.exit(0);
            }

            // Check for pgvector extension
            if (!existingSchema.includes('postgresqlExtensions')) {
                console.log('Warning: pgvector extension not enabled.');
                console.log('   Add the following to your schema.prisma:\n');
                console.log('   generator client {');
                console.log('     provider = "prisma-client-js"');
                console.log('     previewFeatures = ["postgresqlExtensions"]');
                console.log('   }\n');
                console.log('   datasource db {');
                console.log('     provider = "postgresql"');
                console.log('     url = env("DATABASE_URL")');
                console.log('     extensions = [vector]');
                console.log('   }\n');
            }

            // Context-RAG models to append
            const contextRagModels = `
// ============================================
// Context-RAG Models
// ============================================

/// Stores prompt configurations for different document types
model ContextRagPromptConfig {
  id            String   @id @default(uuid())
  documentType  String   @map("document_type")
  name          String
  systemPrompt  String   @map("system_prompt") @db.Text
  chunkStrategy Json     @map("chunk_strategy")
  version       Int      @default(1)
  isActive      Boolean  @default(true) @map("is_active")
  isDefault     Boolean  @default(false) @map("is_default")
  createdBy     String?  @map("created_by")
  changeLog     String?  @map("change_log")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  chunks ContextRagChunk[]

  @@unique([documentType, version])
  @@index([documentType, isActive])
  @@map("context_rag_prompt_configs")
}

/// Stores vector chunks for semantic search
model ContextRagChunk {
  id             String   @id @default(uuid())
  promptConfigId String   @map("prompt_config_id")
  promptConfig   ContextRagPromptConfig @relation(fields: [promptConfigId], references: [id], onDelete: Cascade)
  documentId     String   @map("document_id")
  chunkIndex     Int      @map("chunk_index")
  chunkType      String   @map("chunk_type")

  /// Plain text content optimized for vector search
  searchContent  String   @map("search_content") @db.Text

  /// Enriched content: context + searchContent (for RAG enhancement)
  enrichedContent String? @map("enriched_content") @db.Text

  /// AI-generated context text only (for debugging)
  contextText    String?  @map("context_text") @db.Text

  /// Vector embedding (768 dimensions for Gemini)
  searchVector   Unsupported("vector(768)") @map("search_vector")

  /// Rich Markdown content for display
  displayContent String   @map("display_content") @db.Text

  sourcePageStart Int     @map("source_page_start")
  sourcePageEnd   Int     @map("source_page_end")
  confidenceScore Float   @default(0.5) @map("confidence_score")
  metadata        Json

  createdAt DateTime @default(now()) @map("created_at")

  @@index([promptConfigId])
  @@index([documentId])
  @@index([chunkType])
  @@index([confidenceScore])
  @@map("context_rag_chunks")
}

/// Tracks document processing state
model ContextRagDocument {
  id           String   @id @default(uuid())
  filename     String
  fileHash     String   @map("file_hash")
  fileSize     Int      @map("file_size")
  pageCount    Int      @map("page_count")
  documentType String?  @map("document_type")

  /// Experiment identifier for A/B testing models
  experimentId String?  @map("experiment_id")

  /// AI model used for processing
  modelName    String?  @map("model_name")

  /// Model configuration as JSON
  modelConfig  Json?    @map("model_config")

  status       String   @default("PENDING")

  promptConfigId   String? @map("prompt_config_id")
  totalBatches     Int     @default(0) @map("total_batches")
  completedBatches Int     @default(0) @map("completed_batches")
  failedBatches    Int     @default(0) @map("failed_batches")

  tokenUsage   Json?    @map("token_usage")
  processingMs Int?     @map("processing_ms")
  errorMessage String?  @map("error_message")

  createdAt   DateTime  @default(now()) @map("created_at")
  completedAt DateTime? @map("completed_at")

  batches ContextRagBatch[]

  @@unique([fileHash, experimentId])
  @@index([status])
  @@index([fileHash])
  @@index([documentType])
  @@index([experimentId])
  @@map("context_rag_documents")
}

/// Tracks individual batch processing jobs
model ContextRagBatch {
  id         String @id @default(uuid())
  documentId String @map("document_id")
  document   ContextRagDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  batchIndex Int    @map("batch_index")
  pageStart  Int    @map("page_start")
  pageEnd    Int    @map("page_end")
  status     String @default("PENDING")
  retryCount Int    @default(0) @map("retry_count")
  lastError  String? @map("last_error")

  tokenUsage   Json? @map("token_usage")
  processingMs Int?  @map("processing_ms")

  startedAt   DateTime? @map("started_at")
  completedAt DateTime? @map("completed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@unique([documentId, batchIndex])
  @@index([documentId, status])
  @@index([status])
  @@map("context_rag_batches")
}
// ============================================
// Context-RAG Models (END)
// ============================================
`;

            // Remove existing Context-RAG models if force
            let newSchema = existingSchema;
            const startMarker = '// ============================================\n// Context-RAG Models';
            const endMarker = '// ============================================\n// Context-RAG Models (END)';

            if (options.force) {
                const startIndex = newSchema.indexOf(startMarker);
                const endIndex = newSchema.indexOf(endMarker);

                if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                    const endOfBlock = endIndex + endMarker.length;
                    newSchema =
                        newSchema.substring(0, startIndex).trim() +
                        '\n\n' +
                        newSchema.substring(endOfBlock).trim();
                } else if (startIndex !== -1) {
                    newSchema = newSchema.substring(0, startIndex).trim();
                } else {
                    const modelNames = [
                        'ContextRagPromptConfig',
                        'ContextRagChunk',
                        'ContextRagDocument',
                        'ContextRagBatch',
                    ];
                    for (const modelName of modelNames) {
                        const modelRegex = new RegExp(
                            `model\\s+${modelName}\\s+\\{[\\s\\S]*?\\}\\s*`,
                            'g'
                        );
                        newSchema = newSchema.replace(modelRegex, '');
                    }
                    newSchema = newSchema.trim();
                }
            }

            // Append new models
            newSchema = newSchema.trim() + '\n' + contextRagModels;

            // Write updated schema
            await fs.writeFile(schemaPath, newSchema);

            console.log('Done: Context-RAG models added to prisma/schema.prisma\\n');
            console.log('Next steps:');
            console.log('  1. Run: npx prisma migrate dev --name add_context_rag');
            console.log('  2. Enable pgvector in PostgreSQL: CREATE EXTENSION IF NOT EXISTS vector;');
            console.log('  3. Start using Context-RAG!\n');

        } catch (error) {
            console.error('Error:', (error as Error).message);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Check Context-RAG setup status')
    .action(async () => {
        console.log('Checking Context-RAG status...\\n');

        // Check schema
        const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
        try {
            const schema = await fs.readFile(schemaPath, 'utf-8');

            console.log('Prisma Schema:');
            console.log('  OK: schema.prisma found');
            console.log(`  ${schema.includes('ContextRagChunk') ? 'OK' : 'MISSING'}: Context-RAG models`);
            console.log(`  ${schema.includes('postgresqlExtensions') ? 'OK' : 'MISSING'}: pgvector extension`);
            console.log();
        } catch {
            console.log('MISSING: prisma/schema.prisma not found\\n');
        }

        // Check env - note: these are checked at runtime, not via centralized env
        // since CLI may run before env is fully configured
        console.log('Environment:');
        console.log(`  ${process.env['DATABASE_URL'] ? 'OK' : 'MISSING'}: DATABASE_URL`);
        console.log(`  ${process.env['GEMINI_API_KEY'] ? 'OK' : 'MISSING'}: GEMINI_API_KEY`);
        console.log(`  ${process.env['COHERE_API_KEY'] ? 'OK' : 'OPTIONAL'}: COHERE_API_KEY`);
        console.log();
    });

program
    .command('check-embeddings')
    .description('Check for embedding model mismatch between config and database')
    .option('-p, --provider <provider>', 'Embedding provider (gemini|openai|cohere)', 'gemini')
    .option('-m, --model <model>', 'Embedding model override')
    .option('-k, --api-key <key>', 'Embedding provider API key override')
    .option('--database-url <url>', 'Database URL override')
    .action(async (options) => {
        console.log('Checking embedding model status...\n');

        try {
            const provider = normalizeProvider(options.provider);
            const { prisma, migrationService } = await createMigrationService({
                provider,
                model: options.model,
                apiKey: options.apiKey,
                databaseUrl: options.databaseUrl,
            });

            const mismatch = await migrationService.checkMismatch();

            console.log('Embedding Status:');
            console.log(`  Provider: ${mismatch.currentProvider}`);
            console.log(`  Model: ${mismatch.currentModel}`);
            console.log(`  Dimension: ${mismatch.currentDimension}`);
            console.log(`  Total chunks: ${mismatch.totalChunks}`);
            console.log(`  Chunks to migrate: ${mismatch.chunksToMigrate}`);
            console.log(`  Mismatch: ${mismatch.hasMismatch ? 'YES' : 'NO'}`);
            console.log();

            if (mismatch.existingModels.length > 0) {
                console.log('Existing models in DB:');
                for (const model of mismatch.existingModels) {
                    console.log(
                        `  - ${model.model ?? 'unknown'} (${model.dimension ?? 'unknown'}d): ${model.count}`
                    );
                }
                console.log();
            }

            await prisma.$disconnect();
        } catch (error) {
            console.error('Error:', (error as Error).message);
            process.exit(1);
        }
    });

program
    .command('reindex')
    .description('Re-index all chunks with current embedding model')
    .option('-c, --concurrency <number>', 'Number of concurrent embedding calls', '5')
    .option('-b, --batch-size <number>', 'Batch size for processing', '50')
    .option('-d, --document-id <id>', 'Re-index specific document only')
    .option('-p, --provider <provider>', 'Embedding provider (gemini|openai|cohere)', 'gemini')
    .option('-m, --model <model>', 'Embedding model override')
    .option('-k, --api-key <key>', 'Embedding provider API key override')
    .option('--database-url <url>', 'Database URL override')
    .option('--include-matching', 'Re-index even if embedding model matches')
    .action(async (options) => {
        console.log('Starting re-indexing operation...\n');

        const concurrency = Number.parseInt(options.concurrency, 10);
        const batchSize = Number.parseInt(options.batchSize, 10);
        const documentIds = options.documentId
            ? String(options.documentId)
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id.length > 0)
            : undefined;

        console.log('Options:');
        console.log(`  Concurrency: ${concurrency}`);
        console.log(`  Batch size: ${batchSize}`);
        if (documentIds && documentIds.length > 0) {
            console.log(`  Document IDs: ${documentIds.join(', ')}`);
        }
        console.log(`  Include matching: ${options.includeMatching ? 'yes' : 'no'}`);
        console.log();

        try {
            const provider = normalizeProvider(options.provider);
            const { prisma, migrationService } = await createMigrationService({
                provider,
                model: options.model,
                apiKey: options.apiKey,
                databaseUrl: options.databaseUrl,
            });

            const result = await migrationService.reindex({
                concurrency,
                batchSize,
                documentIds,
                skipMatching: !options.includeMatching,
                onProgress: (progress) => {
                    const percent = progress.total > 0
                        ? Math.round((progress.processed / progress.total) * 100)
                        : 0;
                    console.log(
                        `Progress: ${progress.processed}/${progress.total} (${percent}%)` +
                        ` | ok: ${progress.succeeded} | failed: ${progress.failed}`
                    );
                },
            });

            console.log('\nRe-indexing complete:');
            console.log(`  Success: ${result.success ? 'yes' : 'no'}`);
            console.log(`  Processed: ${result.totalProcessed}`);
            console.log(`  Succeeded: ${result.succeeded}`);
            console.log(`  Failed: ${result.failed}`);
            console.log(`  New model: ${result.newModel}`);
            console.log(`  Duration: ${Math.round(result.durationMs / 1000)}s`);

            if (result.failures.length > 0) {
                console.log('\nFailures:');
                for (const failure of result.failures.slice(0, 20)) {
                    console.log(`  - ${failure.chunkId}: ${failure.error}`);
                }
                if (result.failures.length > 20) {
                    console.log(`  ...and ${result.failures.length - 20} more`);
                }
            }

            await prisma.$disconnect();
        } catch (error) {
            console.error('Error:', (error as Error).message);
            process.exit(1);
        }
    });

program.parse();


