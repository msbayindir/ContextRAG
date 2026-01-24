/**
 * 12 - LLM Provider: Anthropic (Gemini for documents)
 *
 * Run: npx tsx examples/12-llm-provider-anthropic.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('Context-RAG LLM Provider Example: Anthropic');

    if (!process.env.ANTHROPIC_API_KEY || !process.env.GEMINI_API_KEY) {
        console.log('ANTHROPIC_API_KEY or GEMINI_API_KEY is not set. Exiting.');
        return;
    }

    const prisma = new PrismaClient();
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY,
        llmProvider: {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: 'claude-3-5-sonnet-20240620',
        },
        documentProvider: {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
        },
    });

    const ingestResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'anthropic-llm.pdf',
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


