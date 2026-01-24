/**
 * 11 - LLM Provider: OpenAI (Gemini for documents)
 *
 * Run: npx tsx examples/11-llm-provider-openai.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('Context-RAG LLM Provider Example: OpenAI');

    if (!process.env.OPENAI_API_KEY || !process.env.GEMINI_API_KEY) {
        console.log('OPENAI_API_KEY or GEMINI_API_KEY is not set. Exiting.');
        return;
    }

    const prisma = new PrismaClient();
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY,
        llmProvider: {
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini',
        },
        documentProvider: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
        },
    });

    const ingestResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'openai-llm.pdf',
    });

    console.log(`Ingested: ${ingestResult.chunkCount} chunks`);

    const results = await rag.search({
        query: 'Summarize the main topic.',
        limit: 3,
    });

    console.log(`Search results: ${results.length}`);

    await prisma.$disconnect();
}

main().catch(console.error);


