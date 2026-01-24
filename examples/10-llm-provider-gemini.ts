/**
 * 10 - LLM Provider: Gemini
 *
 * Run: npx tsx examples/10-llm-provider-gemini.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('Context-RAG LLM Provider Example: Gemini');

    if (!process.env.GEMINI_API_KEY) {
        console.log('GEMINI_API_KEY is not set. Exiting.');
        return;
    }

    const prisma = new PrismaClient();
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY,
        llmProvider: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
        },
        documentProvider: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
        },
    });

    const ingestResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'gemini-llm.pdf',
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


