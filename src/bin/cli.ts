#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
    .name('context-rag')
    .description('Context-RAG CLI - Setup and management tools')
    .version('1.0.0-beta.1');

program
    .command('init')
    .description('Initialize Context-RAG in your project')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (options) => {
        console.log('🚀 Initializing Context-RAG...\n');

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
                console.log('❌ Prisma schema not found at prisma/schema.prisma');
                console.log('   Please run `npx prisma init` first.\n');
                process.exit(1);
            }

            // Read existing schema
            const existingSchema = await fs.readFile(schemaPath, 'utf-8');

            // Check if Context-RAG models already exist
            if (existingSchema.includes('ContextRagChunk') && !options.force) {
                console.log('⚠️  Context-RAG models already exist in schema.');
                console.log('   Use --force to overwrite.\n');
                process.exit(0);
            }

            // Check for pgvector extension
            if (!existingSchema.includes('postgresqlExtensions')) {
                console.log('⚠️  Warning: pgvector extension not enabled.');
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
`;

            // Remove existing Context-RAG models if force
            let newSchema = existingSchema;
            if (options.force && existingSchema.includes('// Context-RAG Models')) {
                const startMarker = '// ============================================\n// Context-RAG Models';
                const startIndex = newSchema.indexOf(startMarker);
                if (startIndex !== -1) {
                    newSchema = newSchema.substring(0, startIndex).trim();
                }
            }

            // Append new models
            newSchema = newSchema.trim() + '\n' + contextRagModels;

            // Write updated schema
            await fs.writeFile(schemaPath, newSchema);

            console.log('✅ Context-RAG models added to prisma/schema.prisma\n');
            console.log('Next steps:');
            console.log('  1. Run: npx prisma migrate dev --name add_context_rag');
            console.log('  2. Enable pgvector in PostgreSQL: CREATE EXTENSION IF NOT EXISTS vector;');
            console.log('  3. Start using Context-RAG!\n');

        } catch (error) {
            console.error('❌ Error:', (error as Error).message);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Check Context-RAG setup status')
    .action(async () => {
        console.log('🔍 Checking Context-RAG status...\n');

        // Check schema
        const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
        try {
            const schema = await fs.readFile(schemaPath, 'utf-8');

            console.log('Prisma Schema:');
            console.log(`  ✅ schema.prisma found`);
            console.log(`  ${schema.includes('ContextRagChunk') ? '✅' : '❌'} Context-RAG models`);
            console.log(`  ${schema.includes('postgresqlExtensions') ? '✅' : '❌'} pgvector extension`);
            console.log();
        } catch {
            console.log('❌ prisma/schema.prisma not found\n');
        }

        // Check env - note: these are checked at runtime, not via centralized env
        // since CLI may run before env is fully configured
        console.log('Environment:');
        console.log(`  ${process.env['DATABASE_URL'] ? '✅' : '❌'} DATABASE_URL`);
        console.log(`  ${process.env['GEMINI_API_KEY'] ? '✅' : '❌'} GEMINI_API_KEY`);
        console.log(`  ${process.env['COHERE_API_KEY'] ? '✅' : '⚪'} COHERE_API_KEY (optional)`);
        console.log();
    });

program
    .command('check-embeddings')
    .description('Check for embedding model mismatch between config and database')
    .action(async () => {
        console.log('🔍 Checking embedding model status...\n');

        try {
            // Dynamic import to verify module exists (void to suppress unused warning)
            void (await import('../utils/embedding-utils.js'));

            // We can't fully check without a configured client, so just show stats
            console.log('⚠️  Full mismatch detection requires database connection.');
            console.log('   Use this command programmatically with your Prisma client.\n');
            console.log('Example:');
            console.log('  import { detectEmbeddingMismatch } from "@msbayindir/context-rag";');
            console.log('  const mismatch = await detectEmbeddingMismatch(prisma, provider);');
            console.log();
        } catch (error) {
            console.error('❌ Error:', (error as Error).message);
            process.exit(1);
        }
    });

program
    .command('reindex')
    .description('Re-index all chunks with current embedding model')
    .option('-c, --concurrency <number>', 'Number of concurrent embedding calls', '5')
    .option('-b, --batch-size <number>', 'Batch size for processing', '50')
    .option('-d, --document-id <id>', 'Re-index specific document only')
    .action(async (options) => {
        console.log('🔄 Starting re-indexing operation...\n');

        console.log('Options:');
        console.log(`  Concurrency: ${options.concurrency}`);
        console.log(`  Batch size: ${options.batchSize}`);
        if (options.documentId) {
            console.log(`  Document ID: ${options.documentId}`);
        }
        console.log();

        console.log('⚠️  Re-indexing requires database connection and embedding provider.');
        console.log('   Use this command programmatically:\n');
        console.log('Example:');
        console.log('  import { MigrationService } from "@msbayindir/context-rag";');
        console.log('  const migrationService = new MigrationService(prisma, provider, config, logger);');
        console.log('  const result = await migrationService.reindex({');
        console.log(`    concurrency: ${options.concurrency},`);
        console.log(`    batchSize: ${options.batchSize},`);
        console.log('    onProgress: (p) => console.log(`${p.processed}/${p.total}`)');
        console.log('  });');
        console.log();
    });

program.parse();
