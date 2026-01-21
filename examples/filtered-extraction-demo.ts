/**
 * Filtered Extraction Demo
 * 
 * This example demonstrates:
 * 1. Custom prompt to extract ONLY specific chunk types (TEXT, QUESTION, LIST, TABLE)
 * 2. Context enrichment ONLY for TEXT chunks (skip others)
 * 
 * This is useful when you only want specific content types from a document
 * and want to optimize context generation costs.
 * 
 * Usage:
 *   npx tsx examples/filtered-extraction-demo.ts
 */

import { ContextRAG, IngestionError, SearchError, ContextRAGError } from '../src/index.js';
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
    console.log('🎯 Filtered Extraction Demo\n');
    console.log('='.repeat(60));
    console.log('This demo extracts ONLY: TEXT, QUESTION, LIST, TABLE');
    console.log('Context enrichment is enabled ONLY for TEXT chunks');
    console.log('='.repeat(60));

    // Initialize Prisma
    console.log('\n📦 Initializing Prisma...');
    const prisma = new PrismaClient();

    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database connection failed:', (error as Error).message);
        process.exit(1);
    }

    // Initialize Context-RAG with filtered configuration
    console.log('\n🔧 Initializing Context-RAG with filters...');
    const rag = new ContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-3-pro-preview',
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 16384,
        },

        // 🎯 KEY CONFIGURATION: Context enrichment ONLY for TEXT chunks
        // All other types (QUESTION, LIST, TABLE) will be extracted but NOT enriched
        ragEnhancement: {
            approach: 'anthropic_contextual',
            strategy: 'llm',
            model: 'gemini-2.5-flash',  // Fast model for context generation

            // Skip context generation for everything EXCEPT TEXT
            // This means: QUESTION, LIST, TABLE get no context (cheaper & faster)
            skipChunkTypes: ['HEADING', 'IMAGE_REF', 'TABLE', 'CODE', 'QUOTE', 'MIXED', 'QUESTION', 'LIST'],
        },

        batchConfig: {
            pagesPerBatch: 10,
            maxConcurrency: 5,
        },
        logging: {
            level: 'info',
            structured: false,
        },
    });

    // Health check
    const health = await rag.healthCheck();
    if (health.status === 'unhealthy') {
        console.error('❌ System unhealthy');
        await prisma.$disconnect();
        process.exit(1);
    }
    console.log('✅ System healthy');
    console.log(`   Reranking: ${health.reranking.enabled ? '✅ ' + health.reranking.provider : '❌ disabled'}`);

    // Load test PDF
    const testPdfPath = path.join(process.cwd(), 'examples', 'test.pdf');
    let pdfBuffer: Buffer;

    try {
        pdfBuffer = await fs.readFile(testPdfPath);
        console.log(`\n📄 Loaded: ${testPdfPath}`);
    } catch {
        console.error('❌ test.pdf not found in examples folder');
        await prisma.$disconnect();
        process.exit(1);
    }

    // 🎯 FILTERED EXTRACTION with custom prompt
    console.log('\n' + '='.repeat(60));
    console.log('📥 FILTERED INGESTION');
    console.log('='.repeat(60));

    console.log('\n📋 Extraction Configuration:');
    console.log('   ✅ TEXT     → Extract + Context Enrichment');
    console.log('   ✅ QUESTION → Extract (NO context)');
    console.log('   ✅ LIST     → Extract (NO context)');
    console.log('   ✅ TABLE    → Extract (NO context)');
    console.log('   ❌ HEADING  → SKIP');
    console.log('   ❌ CODE     → SKIP');
    console.log('   ❌ QUOTE    → SKIP');
    console.log('   ❌ IMAGE_REF → SKIP');

    const experimentId = `filtered_demo_${Date.now()}`;

    try {
        const result = await rag.ingest({
            file: pdfBuffer,
            filename: 'test.pdf',
            experimentId,
            skipExisting: false,

            // 🎯 KEY: Custom prompt to extract ONLY specific types
            customPrompt: `
Bu belgeden SADECE aşağıdaki içerik tiplerini çıkar:

1. TEXT: Normal metin paragrafları (açıklamalar, tanımlar, bilgiler)
2. QUESTION: Soru-cevap bölümleri, çoktan seçmeli sorular (Soru X: ... Cevap: ...)
3. LIST: Madde işaretli veya numaralı listeler
4. TABLE: Veri tabloları (Markdown formatında)

❌ ATLAMA GEREKENLERİ (BUNLARI ÇIKARMA):
- HEADING (başlıkları atlat, paragraf metnine dahil et)
- CODE (kod bloklarını atlat)
- QUOTE (alıntıları atlat)
- IMAGE_REF (görsel açıklamalarını atlat)

ÖNEMLİ KURALLAR:
- Her soru-cevap çiftini TEK bir QUESTION chunk olarak çıkar
- Tabloları Markdown formatında çıkar
- Listeleri bullet point veya numaralı olarak koru
- Paragrafları bölme, ilgili metinleri birleştir
`,
            onProgress: (status) => {
                const progress = `${status.current}/${status.total}`;
                const pages = status.pageRange
                    ? `pages ${status.pageRange.start}-${status.pageRange.end}`
                    : '';
                console.log(`   📦 Batch ${progress} ${status.status} ${pages}`);
            },
        });

        console.log('\n✅ Ingestion Complete!');
        console.log(`   Document ID: ${result.documentId}`);
        console.log(`   Chunks Created: ${result.chunkCount}`);
        console.log(`   Processing Time: ${result.processingMs}ms`);

        // 🔎 SEARCH DEMO
        console.log('\n' + '='.repeat(60));
        console.log('🔎 SEARCH DEMO');
        console.log('='.repeat(60));

        const queries = [
            'ATP sentezi nasıl gerçekleşir?',
            'Siyanür hangi kompleksi inhibe eder?',
        ];

        for (const query of queries) {
            console.log(`\n   Query: "${query}"`);

            const searchResults = await rag.search({
                query,
                limit: 3,
                mode: 'hybrid',
                // 🎯 Optional: Filter search results to specific types
                filters: {
                    chunkTypes: ['TEXT', 'TABLE', 'LIST', 'QUESTION'],
                },
            });

            if (searchResults.length === 0) {
                console.log('   No results found');
            } else {
                searchResults.forEach((r, i) => {
                    console.log(`\n   [${i + 1}] Score: ${r.score.toFixed(3)} | Type: ${r.chunk.chunkType}`);
                    console.log(`       ${r.chunk.displayContent.slice(0, 120)}...`);
                });
            }
        }

        // 📊 CHUNK STATISTICS
        console.log('\n' + '='.repeat(60));
        console.log('📊 CHUNK STATISTICS');
        console.log('='.repeat(60));

        // Query chunk type distribution
        const chunkStats = await prisma.$queryRaw<Array<{ chunk_type: string; count: bigint }>>`
            SELECT chunk_type, COUNT(*) as count 
            FROM context_rag_chunks 
            WHERE document_id = ${result.documentId}
            GROUP BY chunk_type 
            ORDER BY count DESC
        `;

        console.log('\n   Chunk Distribution:');
        for (const stat of chunkStats) {
            const hasContext = ['TEXT'].includes(stat.chunk_type) ? '(+context)' : '(no context)';
            console.log(`   - ${stat.chunk_type}: ${stat.count} ${hasContext}`);
        }

    } catch (error) {
        // Enterprise error handling
        if (error instanceof IngestionError) {
            console.error(`❌ Ingestion Error [${error.code}]: ${error.message}`);
            console.error(`   Correlation ID: ${error.correlationId}`);
            console.error(`   Retryable: ${error.retryable}`);
            if (error.batchIndex !== undefined) {
                console.error(`   Failed Batch: ${error.batchIndex}`);
            }
        } else if (error instanceof SearchError) {
            console.error(`❌ Search Error: ${error.message}`);
            console.error(`   Correlation ID: ${error.correlationId}`);
        } else if (error instanceof ContextRAGError) {
            console.error(`❌ Error [${error.code}]: ${error.message}`);
            console.error(`   Correlation ID: ${error.correlationId}`);
        } else {
            console.error('❌ Unexpected error:', (error as Error).message);
        }
    }

    console.log('\n✨ Demo complete!');
    await prisma.$disconnect();
}

main().catch(console.error);
