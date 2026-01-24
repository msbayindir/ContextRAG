/**
 * Search/Retrieval Test Demo
 * 
 * Tests the search functionality with various biochemistry queries.
 * Run AFTER ingesting a document with demo.ts or filtered-extraction-demo.ts
 * 
 * Usage:
 *   npx tsx examples/search-test.ts
 */

import { createContextRAG, SearchError, RerankingError, ContextRAGError } from '../src/index.js';
import { PrismaClient } from '@prisma/client';

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
    console.log('🔎 Search/Retrieval Test Demo\n');
    console.log('='.repeat(60));

    const prisma = new PrismaClient();

    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected\n');
    } catch (error) {
        console.error('❌ Database connection failed:', (error as Error).message);
        process.exit(1);
    }

    const rag = createContextRAG({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma: prisma as any,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-3-flash-preview',
        // Enable reranking for better results
        rerankingConfig: {
            enabled: true,
            provider: 'gemini',
        },
        logging: {
            level: 'warn',
            structured: false,
        },
    });

    // Show health status including reranking
    const health = await rag.healthCheck();
    console.log(`🏥 Health: ${health.status}`);
    console.log(`   Reranking: ${health.reranking.enabled ? '✅ ' + health.reranking.provider : '❌'}\n`);

    // Test queries
    const queries = [
        'Krebs Döngüsü nedir?',
        'ETZ inhibitörleri nelerdir?',
        'Siyanür hangi kompleksi inhibe eder?',
        'Glikoliz nedir?',
        'ATP sentezi nasıl gerçekleşir?',
    ];

    for (const query of queries) {
        console.log('='.repeat(60));
        console.log(`\n🔍 Query: "${query}"\n`);

        try {
            const results = await rag.search({
                query,
                limit: 10,
                mode: 'hybrid',
                useReranking: true,
                includeExplanation: true
            });

            if (results.length === 0) {
                console.log('   ❌ No results found\n');
                continue;
            }

            results.forEach((r, i) => {
                const reranked = r.explanation?.reranked ? '🔄' : '';
                console.log(`   [${i + 1}] ${reranked} Score: ${r.score.toFixed(3)} | Type: ${r.chunk.chunkType} | Page: ${r.chunk.sourcePageStart}`);

                // Show context if available
                const metadata = r.chunk.metadata as { contextText?: string };
                if (metadata?.contextText) {
                    console.log(`       Context: ${metadata.contextText.slice(0, 100)}...`);
                }

                // Show content snippet
                console.log(`       Content: ${r.chunk.displayContent.slice(0, 150)}...`);
                console.log();
            });
        } catch (error) {
            // Enterprise error handling
            if (error instanceof RerankingError) {
                console.error(`   ⚠️ Reranking failed (${error.provider}), results may be unranked`);
                console.error(`      Correlation ID: ${error.correlationId}`);
            } else if (error instanceof SearchError) {
                console.error(`   ❌ Search Error: ${error.message}`);
                console.error(`      Correlation ID: ${error.correlationId}`);
            } else if (error instanceof ContextRAGError) {
                console.error(`   ❌ Error [${error.code}]: ${error.message}`);
                console.error(`      Correlation ID: ${error.correlationId}`);
            } else {
                console.error('   ❌ Unexpected error:', (error as Error).message);
            }
        }
    }

    console.log('='.repeat(60));
    console.log('\n✨ Search test complete!');
    await prisma.$disconnect();
}

main().catch(console.error);

