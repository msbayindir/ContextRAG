/**
 * 04 - Reranking
 * 
 * Reranking improves search relevance by re-scoring candidates using AI.
 * Based on Anthropic's research, it reduces retrieval failure by ~67%.
 * 
 * Providers:
 * - gemini: Uses your existing Gemini quota (free)
 * - cohere: Better quality, 10K/month free tier
 * 
 * Run: npx tsx examples/04-reranking.ts
 */

import 'dotenv/config';

import { createContextRAG } from '../src/index.js';

import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('Context-RAG Reranking Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();

    // Option 1: Gemini Reranking (free, uses your quota)
    console.log('\nOption 1: Gemini Reranking');
    
    const ragGemini = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        // If using OpenAI/Anthropic as primary LLM, set llmProvider accordingly.
        model: 'gemini-2.5-flash',
        rerankingConfig: {
            enabled: true,
            provider: 'gemini',
            defaultCandidates: 50,  // Get 50 candidates
            defaultTopK: 5,         // Return top 5 after reranking
        },
    });

    const query = 'What are the side effects of the medication?';

    // Search with reranking enabled by default
    const geminiResults = await ragGemini.search({
        query,
        mode: 'hybrid',
        limit: 5,
        // useReranking: true (default when rerankingConfig.enabled = true)
    });

    console.log(`\n   Query: "${query}"`);
    console.log('   Results (reranked with Gemini provider):');
    geminiResults.forEach((r, i) => {
        console.log(`   ${i + 1}. [Score: ${r.score.toFixed(3)}]`);
        console.log(`      Original Rank: ${r.explanation?.originalRank || 'N/A'}`);
        console.log(`      ${r.chunk.displayContent.slice(0, 100)}...`);
    });

    // Option 2: Cohere Reranking (better quality)
    console.log('\nOption 2: Cohere Reranking');
    
    if (process.env.COHERE_API_KEY) {
        const ragCohere = createContextRAG({
            prisma,
            geminiApiKey: process.env.GEMINI_API_KEY!,
            model: 'gemini-2.5-flash',
            rerankingConfig: {
                enabled: true,
                provider: 'cohere',
                cohereApiKey: process.env.COHERE_API_KEY,
                defaultCandidates: 50,
                defaultTopK: 5,
            },
        });

        const cohereResults = await ragCohere.search({
            query,
            mode: 'hybrid',
            limit: 5,
        });

        console.log(`\n   Results (reranked with Cohere):`);
        cohereResults.forEach((r, i) => {
            console.log(`   ${i + 1}. [Score: ${r.score.toFixed(3)}] ${r.chunk.displayContent.slice(0, 80)}...`);
        });
    } else {
        console.log('   COHERE_API_KEY not set. Skipping Cohere example.');
        console.log('   Get free API key at: https://cohere.com/');
    }

    // Option 3: Per-query reranking control
    console.log('\nOption 3: Per-Query Reranking Control');
    
    // Disable reranking for a specific query
    const fastResults = await ragGemini.search({
        query,
        mode: 'semantic',
        limit: 5,
        useReranking: false,  // Disable for this query (faster)
    });

    console.log(`\n   Fast search (no reranking): ${fastResults.length} results`);

    // Override candidates/topK for specific query
    const customResults = await ragGemini.search({
        query,
        mode: 'hybrid',
        limit: 3,
        useReranking: true,
        rerankCandidates: 100,  // Get more candidates
    });

    console.log(`   Custom reranking (100 candidates to 3): ${customResults.length} results`);

    // Cleanup
    await prisma.$disconnect();
    console.log('\nDone!');
}

main().catch(console.error);






