/**
 * 08 - Embedding Providers
 * 
 * Context-RAG supports multiple embedding providers:
 * - gemini: Google's text-embedding-004 (default, free with API key)
 * - openai: OpenAI's text-embedding-3-small/large
 * - cohere: Cohere's embed-multilingual-v3.0
 * 
 * Run: npx tsx examples/08-embedding-providers.ts
 */

import 'dotenv/config';

import { createContextRAG } from '../src/index.js';

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

async function main() {
    console.log('Context-RAG Embedding Providers Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Provider 1: Gemini (Default)
    console.log('\nProvider 1: Gemini (Default)');
    console.log('   Model: text-embedding-004');
    console.log('   Dimensions: 768');
    
    const ragGemini = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        // embeddingProvider is optional, defaults to Gemini
    });

    const geminiResult = await ragGemini.ingest({
        file: pdfBuffer,
        filename: 'gemini-embeddings.pdf',
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`    Ingested with Gemini: ${geminiResult.chunkCount} chunks`);

    // Provider 2: OpenAI
    console.log('\nProvider 2: OpenAI');
    
    if (process.env.OPENAI_API_KEY) {
        console.log('   Model: text-embedding-3-small');
        console.log('   Dimensions: 1536');
        
        const ragOpenAI = createContextRAG({
            prisma,
            geminiApiKey: process.env.GEMINI_API_KEY!,
            embeddingProvider: {
                provider: 'openai',
                apiKey: process.env.OPENAI_API_KEY,
                model: 'text-embedding-3-small',  // or 'text-embedding-3-large'
            },
        });

        const openaiResult = await ragOpenAI.ingest({
            file: pdfBuffer,
            filename: 'openai-embeddings.pdf',
            onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
        });

        console.log(`    Ingested with OpenAI: ${openaiResult.chunkCount} chunks`);
    } else {
        console.log('    OPENAI_API_KEY not set. Skipping OpenAI example.');
    }

    // Provider 3: Cohere
    console.log('\nProvider 3: Cohere');
    
    if (process.env.COHERE_API_KEY) {
        console.log('   Model: embed-multilingual-v3.0');
        console.log('   Dimensions: 1024');
        console.log('   Note: Great for multilingual content');
        
        const ragCohere = createContextRAG({
            prisma,
            geminiApiKey: process.env.GEMINI_API_KEY!,
            embeddingProvider: {
                provider: 'cohere',
                apiKey: process.env.COHERE_API_KEY,
                model: 'embed-multilingual-v3.0',
            },
        });

        const cohereResult = await ragCohere.ingest({
            file: pdfBuffer,
            filename: 'cohere-embeddings.pdf',
            onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
        });

        console.log(`    Ingested with Cohere: ${cohereResult.chunkCount} chunks`);
    } else {
        console.log('    COHERE_API_KEY not set. Skipping Cohere example.');
    }

    // Important: Dimension mismatch warning
    console.log('\n Important Notes:');
    console.log('   1. Each provider has different embedding dimensions');
    console.log('   2. pgvector column must match the dimension');
    console.log('   3. You cannot mix embeddings from different providers');
    console.log('   4. Use CLI to check: npx @msbayindir/context-rag check-embeddings');
    console.log('   5. Use CLI to reindex: npx @msbayindir/context-rag reindex');

    // Cleanup
    await prisma.$disconnect();
    console.log('\nDone!');
}

main().catch(console.error);






