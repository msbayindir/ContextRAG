#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
    .name('context-rag')
    .description('Context-RAG CLI - Setup and management tools')
    .version('0.1.0');

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

model ContextRagPromptConfig {
  id            String   @id @default(uuid())
  documentType  String
  name          String
  systemPrompt  String   @db.Text
  chunkStrategy Json
  version       Int      @default(1)
  isActive      Boolean  @default(true)
  isDefault     Boolean  @default(false)
  createdBy     String?
  changeLog     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  chunks ContextRagChunk[]

  @@unique([documentType, version])
  @@index([documentType, isActive])
  @@map("context_rag_prompt_configs")
}

model ContextRagChunk {
  id             String   @id @default(uuid())
  promptConfigId String
  promptConfig   ContextRagPromptConfig @relation(fields: [promptConfigId], references: [id], onDelete: Cascade)
  documentId     String
  chunkIndex     Int
  chunkType      String

  searchContent  String   @db.Text
  searchVector   Unsupported("vector(768)")
  displayContent String   @db.Text

  sourcePageStart Int
  sourcePageEnd   Int
  confidenceScore Float    @default(0.5)
  metadata        Json

  createdAt DateTime @default(now())

  @@index([promptConfigId])
  @@index([documentId])
  @@index([chunkType])
  @@map("context_rag_chunks")
}

model ContextRagDocument {
  id           String   @id @default(uuid())
  filename     String
  fileHash     String   @unique
  fileSize     Int
  pageCount    Int
  documentType String?
  status       String   @default("PENDING")

  promptConfigId   String?
  totalBatches     Int @default(0)
  completedBatches Int @default(0)
  failedBatches    Int @default(0)

  tokenUsage   Json?
  processingMs Int?
  errorMessage String?

  createdAt   DateTime  @default(now())
  completedAt DateTime?

  batches ContextRagBatch[]

  @@index([status])
  @@index([fileHash])
  @@map("context_rag_documents")
}

model ContextRagBatch {
  id         String @id @default(uuid())
  documentId String
  document   ContextRagDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  batchIndex Int
  pageStart  Int
  pageEnd    Int
  status     String @default("PENDING")
  retryCount Int    @default(0)
  lastError  String?

  tokenUsage   Json?
  processingMs Int?

  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([documentId, status])
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

        // Check env
        console.log('Environment:');
        console.log(`  ${process.env['DATABASE_URL'] ? '✅' : '❌'} DATABASE_URL`);
        console.log(`  ${process.env['GEMINI_API_KEY'] ? '✅' : '❌'} GEMINI_API_KEY`);
        console.log();
    });

program.parse();
