/**
 * 01 - Basic Usage
 * 
 * The simplest way to use Context-RAG:
 * 1. Create instance with createContextRAG()
 * 2. Ingest a PDF
 * 3. Search for content
 * 
 * Run: npx tsx examples/01-basic-usage.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('📚 Context-RAG Basic Usage Example\n');
    console.log('='.repeat(50));

    // 1. Initialize
    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        // Optional: customize model
        model: 'gemini-2.5-flash',
    });

    // 2. Health check
    const health = await rag.healthCheck();
    console.log('\n✅ Health Check:', health.status);

    // 3. Ingest a document
    console.log('\n📥 Ingesting document...');
    
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const result = await rag.ingest({
        file: pdfBuffer,
        filename: 'test.pdf',
        onProgress: (status) => {
            console.log(`   Batch ${status.current}/${status.total}`);
        },
    });

    console.log(`\n✅ Ingested: ${result.chunkCount} chunks created`);
    console.log(`   Document ID: ${result.documentId}`);
    console.log(`   Processing time: ${result.processingMs}ms`);

    // 4. Search
    console.log('\n🔍 Searching...');
    
    const searchResults = await rag.search({
        query: 'What is the main topic of this document?',
        limit: 3,
    });

    console.log(`\n📋 Found ${searchResults.length} results:\n`);
    
    searchResults.forEach((r, i) => {
        console.log(`${i + 1}. [Score: ${r.score.toFixed(3)}]`);
        console.log(`   ${r.chunk.displayContent.slice(0, 150)}...`);
        console.log();
    });

    // Cleanup
    await prisma.$disconnect();
    console.log('✅ Done!');
}

main().catch(console.error);
