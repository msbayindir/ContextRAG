/**
 * Context-RAG End-to-End Demo
 * 
 * Prerequisites:
 * 1. PostgreSQL with pgvector extension
 * 2. GEMINI_API_KEY environment variable
 * 3. DATABASE_URL environment variable
 * 
 * Usage:
 *   npx tsx examples/demo.ts
 */

import { ContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// Check environment variables
if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is required');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

async function main() {
    console.log('🧠 Context-RAG Demo\n');
    console.log('='.repeat(50));

    // Initialize Prisma
    console.log('\n📦 Initializing Prisma...');
    const prisma = new PrismaClient();

    try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected');

        // Check pgvector
        try {
            await prisma.$queryRaw`SELECT * FROM pg_extension WHERE extname = 'vector'`;
            console.log('✅ pgvector extension found');
        } catch {
            console.log('⚠️  pgvector extension not found, trying to install...');
            await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
            console.log('✅ pgvector extension installed');
        }
    } catch (error) {
        console.error('❌ Database connection failed:', (error as Error).message);
        process.exit(1);
    }

    // Initialize Context-RAG
    console.log('\n🔧 Initializing Context-RAG...');
    const rag = new ContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-3-flash-preview',
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
        },
        batchConfig: {
            pagesPerBatch: 10,
            maxConcurrency: 2,
        },
        logging: {
            level: 'info',
            structured: false,
        },
    });

    // Health check
    console.log('\n🏥 Running health check...');
    const health = await rag.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   Database: ${health.database ? '✅' : '❌'}`);
    console.log(`   pgvector: ${health.pgvector ? '✅' : '❌'}`);

    if (health.status === 'unhealthy') {
        console.error('❌ System is unhealthy, exiting...');
        await prisma.$disconnect();
        process.exit(1);
    }

    // Check for test PDF
    const testPdfPath = path.join(process.cwd(), 'examples', 'test.pdf');
    let pdfBuffer: Buffer;

    try {
        pdfBuffer = await fs.readFile(testPdfPath);
        console.log(`\n📄 Found test PDF: ${testPdfPath}`);
    } catch {
        console.log('\n⚠️  No test.pdf found in examples folder');
        console.log('   Creating a simple test with discovery...\n');

        // Just show stats and exit
        const stats = await rag.getStats();
        console.log('📊 Current Stats:');
        console.log(`   Documents: ${stats.totalDocuments}`);
        console.log(`   Chunks: ${stats.totalChunks}`);
        console.log(`   Prompt Configs: ${stats.promptConfigs}`);
        console.log(`   Storage: ${(stats.storageBytes / 1024).toFixed(2)} KB`);

        console.log('\n💡 To run full demo, add a PDF file at: examples/test.pdf');
        await prisma.$disconnect();
        return;
    }

    // ========================================
    // DISCOVERY DEMO
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('🔍 DISCOVERY DEMO');
    console.log('='.repeat(50));

    let discovery;
    let promptConfig;

    try {
        console.log('\n   Analyzing document...');
        discovery = await rag.discover({ file: pdfBuffer });

        console.log(`\n   📋 Discovery Results:`);
        console.log(`      ID: ${discovery.id}`);
        console.log(`      Document Type: ${discovery.documentType}`);
        console.log(`      Confidence: ${(discovery.confidence * 100).toFixed(1)}%`);
        console.log(`      Page Count: ${discovery.pageCount}`);
        console.log(`      Elements Detected: ${discovery.detectedElements.length}`);

        if (discovery.detectedElements.length > 0) {
            console.log(`      Elements:`);
            discovery.detectedElements.forEach(el => {
                console.log(`        - ${el.type}: ${el.count}`);
            });
        }

        console.log(`\n   💡 Suggested Strategy:`);
        console.log(`      Max Tokens: ${discovery.suggestedChunkStrategy.maxTokens}`);
        console.log(`      Split By: ${discovery.suggestedChunkStrategy.splitBy}`);
        console.log(`      Preserve Tables: ${discovery.suggestedChunkStrategy.preserveTables}`);

        // Approve strategy
        console.log('\n   ✅ Approving strategy...');
        promptConfig = await rag.approveStrategy(discovery.id);
        console.log(`      Created Prompt Config: ${promptConfig.id}`);

    } catch (error) {
        console.error('   ❌ Discovery failed:', (error as Error).message);
        return; // Exit if discovery fails
    }

    // ========================================
    // INGESTION DEMO
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('📥 INGESTION DEMO');
    console.log('='.repeat(50));

    try {
        console.log('\n   Processing document...\n');

        const result = await rag.ingest({
            file: pdfBuffer,
            filename: 'test.pdf',
            documentType: discovery.documentType,
            promptConfigId: promptConfig.id,
            skipExisting: false,
            onProgress: (status) => {
                const progress = `${status.current}/${status.total}`;
                const pages = status.pageRange
                    ? `pages ${status.pageRange.start}-${status.pageRange.end}`
                    : '';
                console.log(`   📦 Batch ${progress} ${status.status} ${pages}`);
            },
        });

        console.log(`\n   ✅ Ingestion Complete!`);
        console.log(`      Document ID: ${result.documentId}`);
        console.log(`      Status: ${result.status}`);
        console.log(`      Chunks Created: ${result.chunkCount}`);
        console.log(`      Batches: ${result.batchCount}`);
        console.log(`      Failed Batches: ${result.failedBatchCount}`);
        console.log(`      Processing Time: ${result.processingMs}ms`);
        console.log(`      Token Usage:`);
        console.log(`        Input: ${result.tokenUsage.input}`);
        console.log(`        Output: ${result.tokenUsage.output}`);
        console.log(`        Total: ${result.tokenUsage.total}`);

        if (result.warnings && result.warnings.length > 0) {
            console.log(`\n   ⚠️  Warnings:`);
            result.warnings.forEach(w => console.log(`      - ${w}`));
        }

        // ========================================
        // SEARCH DEMO
        // ========================================
        console.log('\n' + '='.repeat(50));
        console.log('🔎 SEARCH DEMO');
        console.log('='.repeat(50));

        const queries = [
            'What is the main topic of this document?',
            'List the key points mentioned',
            'Are there any tables or data?',
        ];

        for (const query of queries) {
            console.log(`\n   Query: "${query}"`);

            const searchResults = await rag.search({
                query,
                limit: 3,
                mode: 'hybrid',
                includeExplanation: true,
            });

            if (searchResults.length === 0) {
                console.log('   No results found');
            } else {
                searchResults.forEach((r, i) => {
                    console.log(`\n   [${i + 1}] Score: ${r.score.toFixed(3)}`);
                    console.log(`       Type: ${r.chunk.chunkType}`);
                    console.log(`       Content: ${r.chunk.displayContent.slice(0, 100)}...`);
                });
            }
        }

    } catch (error) {
        console.error('   ❌ Ingestion failed:', (error as Error).message);
    }

    // ========================================
    // FINAL STATS
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL STATS');
    console.log('='.repeat(50));

    const stats = await rag.getStats();
    console.log(`\n   Documents: ${stats.totalDocuments}`);
    console.log(`   Chunks: ${stats.totalChunks}`);
    console.log(`   Prompt Configs: ${stats.promptConfigs}`);
    console.log(`   Storage: ${(stats.storageBytes / 1024).toFixed(2)} KB`);

    // Cleanup
    console.log('\n✨ Demo complete!');
    await prisma.$disconnect();
}

main().catch(console.error);
