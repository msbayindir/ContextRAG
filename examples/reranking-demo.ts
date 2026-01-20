/**
 * Reranking Demo - Full Comparison
 * 
 * Sends 50 candidates to reranker, returns top 5.
 * Shows full content to verify relevance quality.
 */

import { ContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Check which reranker to use
const cohereApiKey = process.env.COHERE_API_KEY;
const rerankerProvider = cohereApiKey ? 'cohere' : 'gemini';

async function main() {
    console.log(`\n🔧 Reranker Provider: ${rerankerProvider.toUpperCase()}`);

    const rag = new ContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-2.5-flash',
        rerankingConfig: {
            enabled: true,
            provider: rerankerProvider,
            cohereApiKey: cohereApiKey,
            defaultCandidates: 50,
            defaultTopK: 5,
        },
        logging: { level: 'info' },
    });

    const health = await rag.healthCheck();
    if (health.status !== 'healthy') {
        console.error('Database not healthy, exiting');
        return;
    }

    const query = 'metabolizma ve enerji üretimi';

    console.log('\n' + '='.repeat(80));
    console.log(`SORGU: "${query}"`);
    console.log('='.repeat(80));

    // Search WITHOUT reranking - just top 5 from vector similarity
    console.log('\n📊 RERANKING OLMADAN (Sadece Vector Similarity) - Top 5:');
    console.log('-'.repeat(80));

    const resultsWithout = await rag.search({
        query,
        limit: 5,
        useReranking: false,
    });

    resultsWithout.forEach((r, i) => {
        console.log(`\n${i + 1}. [Skor: ${r.score.toFixed(3)}]`);
        console.log(`   Tip: ${r.chunk.chunkType} | Sayfa: ${r.chunk.sourcePageStart}`);
        console.log(`   İçerik:`);
        console.log(`   ${r.chunk.displayContent.substring(0, 500)}...`);
    });

    // Search WITH reranking - 50 candidates, return top 5
    console.log('\n\n🎯 RERANKING İLE (50 aday → Top 5):');
    console.log('-'.repeat(80));

    const resultsWith = await rag.search({
        query,
        limit: 5,
        useReranking: true,
        rerankCandidates: 50,
    });

    resultsWith.forEach((r, i) => {
        const wasRank = r.explanation?.originalRank !== undefined
            ? ` (Önceki sıra: #${r.explanation.originalRank + 1})`
            : '';
        console.log(`\n${i + 1}. [Skor: ${r.score.toFixed(3)}]${wasRank}`);
        console.log(`   Tip: ${r.chunk.chunkType} | Sayfa: ${r.chunk.sourcePageStart}`);
        console.log(`   İçerik:`);
        console.log(`   ${r.chunk.displayContent.substring(0, 500)}...`);
    });

    // Analysis
    console.log('\n\n📈 KARŞILAŞTIRMA ANALİZİ:');
    console.log('-'.repeat(80));

    const withoutIds = new Set(resultsWithout.map(r => r.chunk.id));
    const withIds = new Set(resultsWith.map(r => r.chunk.id));

    const promoted = resultsWith.filter(r => !withoutIds.has(r.chunk.id));
    const demoted = resultsWithout.filter(r => !withIds.has(r.chunk.id));

    console.log(`• Reranking ile yükselen (50'den top 5'e giren): ${promoted.length}`);
    console.log(`• Reranking ile düşen (top 5'ten çıkan): ${demoted.length}`);

    if (promoted.length > 0) {
        console.log('\n🆕 YENİ GELEN SONUÇLAR (50. sıradan yukarı çıkan):');
        promoted.forEach((r, i) => {
            console.log(`   ${i + 1}. [Skor: ${r.score.toFixed(3)}] ${r.chunk.displayContent.substring(0, 100)}...`);
        });
    }

    if (demoted.length > 0) {
        console.log('\n❌ DÜŞEN SONUÇLAR (Top 5\'ten çıkan):');
        demoted.forEach((r, i) => {
            console.log(`   ${i + 1}. [Skor: ${r.score.toFixed(3)}] ${r.chunk.displayContent.substring(0, 100)}...`);
        });
    }

    await prisma.$disconnect();
}

main().catch(console.error);
