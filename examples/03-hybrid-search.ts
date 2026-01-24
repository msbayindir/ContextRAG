/**
 * 03 - Hybrid Search
 * 
 * Demonstrates different search modes:
 * - semantic: Vector similarity (best for meaning)
 * - keyword: Full-text search (best for exact terms)
 * - hybrid: Combines both (recommended for production)
 * 
 * Run: npx tsx examples/03-hybrid-search.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('🔎 Context-RAG Hybrid Search Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
    });

    const query = 'metabolic pathways and energy production';

    // 1. Semantic Search (Vector)
    console.log('\n🧠 1. Semantic Search:');
    console.log(`   Query: "${query}"`);
    
    const semanticResults = await rag.search({
        query,
        mode: 'semantic',
        limit: 3,
    });

    console.log(`   Found: ${semanticResults.length} results`);
    semanticResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.score.toFixed(3)}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // 2. Keyword Search (Full-text)
    console.log('\n📝 2. Keyword Search:');
    console.log(`   Query: "${query}"`);
    
    const keywordResults = await rag.search({
        query,
        mode: 'keyword',
        limit: 3,
    });

    console.log(`   Found: ${keywordResults.length} results`);
    keywordResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.score.toFixed(3)}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // 3. Hybrid Search (Combined)
    console.log('\n⚡ 3. Hybrid Search (Recommended):');
    console.log(`   Query: "${query}"`);
    
    const hybridResults = await rag.search({
        query,
        mode: 'hybrid',
        limit: 5,
    });

    console.log(`   Found: ${hybridResults.length} results`);
    hybridResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.score.toFixed(3)}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // 4. Filtered Search
    console.log('\n🎯 4. Filtered Search (by chunk type):');
    
    const filteredResults = await rag.search({
        query,
        mode: 'hybrid',
        limit: 3,
        filters: {
            chunkTypes: ['TABLE', 'LIST'], // Only tables and lists
        },
    });

    console.log(`   Found: ${filteredResults.length} TABLE/LIST results`);
    filteredResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.chunkType}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // 5. Type Boosting
    console.log('\n📊 5. Type Boosting (prioritize tables):');
    
    const boostedResults = await rag.search({
        query,
        mode: 'hybrid',
        limit: 5,
        typeBoost: {
            TABLE: 2.0,  // Tables get 2x score boost
            TEXT: 1.0,
        },
    });

    console.log(`   Found: ${boostedResults.length} results (tables boosted 2x)`);
    boostedResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.chunkType}] [${r.score.toFixed(3)}] ${r.chunk.displayContent.slice(0, 60)}...`);
    });

    // Cleanup
    await prisma.$disconnect();
    console.log('\n✅ Done!');
}

main().catch(console.error);
