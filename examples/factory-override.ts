
import { ContextRAGFactory } from '../src/context-rag.factory.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Varsayılanları ezerek (Override) oluşturma örneği
    const customRag = ContextRAGFactory.create({
        // Zorunlu alanlar
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,

        // --- OVERRIDE (EZİLEN) AYARLAR ---

        // 1. Modeli değiştirelim (Varsayılan: gemini-1.5-pro)
        model: 'gemini-1.5-flash',

        // 2. Batch ayarlarını değiştirelim (Daha hızlı ama daha çok hafıza yer)
        batchConfig: {
            pagesPerBatch: 50, // Varsayılan 15
            maxConcurrency: 5,  // Varsayılan 3
            retryDelayMs: 2000
        },

        // 3. Log seviyesini değiştirelim (Detaylı log görelim)
        logging: {
            level: 'debug' // Varsayılan 'info'
        },

        // 4. Parçalama (Chunking) stratejisini değiştirelim
        chunkConfig: {
            maxTokens: 1000,
            overlapTokens: 200   // 'chunkOverlap' değil 'overlapTokens' olmalı
        },

        // 5. Reranking'i açalım (Varsayılan kapalıydı)
        rerankingConfig: {
            enabled: true,
            provider: 'gemini'
            // minRelevanceScore config içinde yok, search sırasında verilir
        }
    });

    console.log('Özel ayarlarla RAG sistemi hazır!');

    // Ayarları kontrol edelim
    const config = customRag.getConfig();
    console.log('Aktif Model:', config.model); // gemini-1.5-flash yazar
    console.log('Sayfa Başına:', config.batchConfig.pagesPerBatch); // 50 yazar
}

main().catch(console.error);
