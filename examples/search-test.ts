/**
 * Search/Retrieval Test Demo
 * 
 * Tests the search functionality with various biochemistry queries.
 * Run AFTER ingesting a document with demo.ts or filtered-extraction-demo.ts
 * 
 * Usage:
 *   npx tsx examples/search-test.ts
 */

import { ContextRAG } from '../src/index.js';
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

    const rag = new ContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-3-flash-preview',
        logging: {
            level: 'warn',
            structured: false,
        },
    });

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

        const results = await rag.search({
            query,
            limit: 10,
            mode: 'hybrid',
            includeExplanation: true
        });

        if (results.length === 0) {
            console.log('   ❌ No results found\n');
            continue;
        }

        results.forEach((r, i) => {
            console.log(`   [${i + 1}] Score: ${r.score.toFixed(3)} | Type: ${r.chunk.chunkType} | Page: ${r.chunk.sourcePageStart}`);

            // Show context if available
            const metadata = r.chunk.metadata as { contextText?: string };
            if (metadata?.contextText) {
                console.log(`       Context: ${metadata.contextText.slice(0, 100)}...`);
            }

            // Show content snippet
            console.log(`       Content: ${r.chunk.displayContent.slice(0, 150)}...`);
            console.log();
        });
    }

    console.log('='.repeat(60));
    console.log('\n✨ Search test complete!');
    await prisma.$disconnect();
}

main().catch(console.error);
