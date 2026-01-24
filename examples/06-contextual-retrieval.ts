/**
 * 06 - Contextual Retrieval
 * 
 * Implements Anthropic's Contextual Retrieval approach.
 * Each chunk gets context about where it came from in the document.
 * 
 * Research shows this improves retrieval quality by ~49%.
 * 
 * Strategies:
 * - none: No context (baseline)
 * - simple: Template-based context (free)
 * - llm: AI-generated context (best quality, costs tokens)
 * 
 * Run: npx tsx examples/06-contextual-retrieval.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('🧠 Context-RAG Contextual Retrieval Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Strategy 1: No Context (Baseline)
    console.log('\n📌 Strategy 1: No Context (Baseline)');
    
    const ragNone = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        ragEnhancement: {
            approach: 'none',  // No context enhancement
        },
    });

    const baselineResult = await ragNone.ingest({
        file: pdfBuffer,
        filename: 'baseline-doc.pdf',
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ Baseline: ${baselineResult.chunkCount} chunks (no context)`);

    // Strategy 2: Simple Context (Free)
    console.log('\n📌 Strategy 2: Simple Context (Template-based, Free)');
    
    const ragSimple = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        ragEnhancement: {
            approach: 'anthropic_contextual',
            strategy: 'simple',  // Template-based, no API calls
        },
    });

    const simpleResult = await ragSimple.ingest({
        file: pdfBuffer,
        filename: 'simple-context-doc.pdf',
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ Simple: ${simpleResult.chunkCount} chunks (template context)`);

    // Strategy 3: LLM Context (Best Quality)
    console.log('\n📌 Strategy 3: LLM Context (AI-generated, Best Quality)');
    
    const ragLLM = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        ragEnhancement: {
            approach: 'anthropic_contextual',
            strategy: 'llm',
            model: 'gemini-2.5-flash',  // Use fast model for context gen
            // Skip context for headings and images (cost optimization)
            skipChunkTypes: ['HEADING', 'IMAGE_REF'],
            concurrencyLimit: 5,  // Parallel context generation
        },
    });

    const llmResult = await ragLLM.ingest({
        file: pdfBuffer,
        filename: 'llm-context-doc.pdf',
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ LLM: ${llmResult.chunkCount} chunks (AI context)`);

    // Compare search results
    console.log('\n🔍 Comparing Search Quality...');
    
    const query = 'What does the inhibitor block?';
    console.log(`   Query: "${query}"`);

    // This query is ambiguous without context
    // With context, the system knows "inhibitor" refers to Complex IV inhibition

    const baselineSearch = await ragNone.search({ query, limit: 1 });
    const llmSearch = await ragLLM.search({ query, limit: 1 });

    console.log('\n   Baseline Result:');
    if (baselineSearch[0]) {
        console.log(`   ${baselineSearch[0].chunk.displayContent.slice(0, 150)}...`);
    }

    console.log('\n   LLM Context Result:');
    if (llmSearch[0]) {
        // searchContent includes the context when RAG enhancement is enabled
        console.log(`   ${llmSearch[0].chunk.searchContent?.slice(0, 200) || llmSearch[0].chunk.displayContent.slice(0, 150)}...`);
    }

    // Cleanup
    await prisma.$disconnect();
    console.log('\n✅ Done!');
}

main().catch(console.error);
