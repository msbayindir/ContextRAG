/**
 * Custom Engine Injection Example (v2.0)
 * 
 * This example demonstrates how to:
 * 1. Create a custom engine by extending the base engine
 * 2. Use the factory to wire all dependencies
 * 3. Inject your custom engine into ContextRAG
 * 
 * Usage:
 *   npx tsx examples/custom-engine-injection.ts
 */

import { ContextRAG, type ContextRAGDependencies } from '../src/context-rag.js';
import { IngestionEngine, type IngestionEngineDependencies } from '../src/engines/ingestion.engine.js';
import { RetrievalEngine, type RetrievalEngineDependencies } from '../src/engines/retrieval.engine.js';
import { DiscoveryEngine } from '../src/engines/discovery.engine.js';
import { GeminiService } from '../src/services/gemini.service.js';
import { ContextRAGFactory } from '../src/context-rag.factory.js';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../src/utils/logger.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';
import { createEmbeddingProvider } from '../src/providers/embedding-provider.factory.js';
import { PDFProcessor } from '../src/services/pdf.processor.js';
import { createReranker } from '../src/services/reranker.service.js';
import {
    DocumentRepository,
    BatchRepository,
    ChunkRepository,
    PromptConfigRepository,
} from '../src/database/index.js';
import type { ResolvedConfig } from '../src/types/config.types.js';
import type { IngestOptions, IngestResult } from '../src/types/ingestion.types.js';

// 1. Define Your Custom Engine (extending the base)
class TurboIngestionEngine extends IngestionEngine {
    // Override: Custom ingest method with extra logging
    async ingest(options: IngestOptions): Promise<IngestResult> {
        console.log('🚀 [TURBO ENGINE] Motor çalıştı! Çok hızlı ingest yapıyorum...');
        console.log(`🚀 [TURBO ENGINE] Dosya işleniyor: ${options.filename || 'unnamed'}`);

        // You can add custom logic here before/after the base implementation
        const result = await super.ingest(options);

        console.log(`🚀 [TURBO ENGINE] İşlem tamamlandı! Chunks: ${result.chunkCount}`);
        return result;
    }
}

// 2. Helper function to create all dependencies
function createDependencies(resolvedConfig: ResolvedConfig) {
    const logger = createLogger(resolvedConfig.logging);
    const rateLimiter = new RateLimiter(resolvedConfig.rateLimitConfig);

    // Core services
    const geminiService = new GeminiService(resolvedConfig, rateLimiter, logger);
    const embeddingProvider = createEmbeddingProvider(resolvedConfig, rateLimiter, logger);
    const pdfProcessor = new PDFProcessor(logger);
    const reranker = createReranker(resolvedConfig, geminiService, logger);

    // Repositories
    const repositories = {
        document: new DocumentRepository(resolvedConfig.prisma),
        batch: new BatchRepository(resolvedConfig.prisma),
        chunk: new ChunkRepository(resolvedConfig.prisma),
        promptConfig: new PromptConfigRepository(resolvedConfig.prisma),
    };

    return {
        logger,
        geminiService,
        embeddingProvider,
        pdfProcessor,
        reranker,
        repositories,
    };
}

async function main() {
    console.log('Custom Engine Injection Example (v2.0)\n');
    console.log('='.repeat(60));

    const prisma = new PrismaClient() as any;

    // User config
    const userConfig = {
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY || 'fake-key',
        logging: { level: 'info' as const },
    };

    // Resolve config (use factory's private method via type assertion)
    const resolvedConfig = (ContextRAGFactory as any).resolveConfig(userConfig) as ResolvedConfig;
    
    // Create all dependencies
    const deps = createDependencies(resolvedConfig);

    // 3. Create your custom engine with proper dependencies
    const ingestionDeps: IngestionEngineDependencies = {
        llm: deps.geminiService,
        pdfProcessor: deps.pdfProcessor,
        embeddingProvider: deps.embeddingProvider,
        repositories: deps.repositories,
    };

    const myTurboEngine = new TurboIngestionEngine(
        resolvedConfig,
        ingestionDeps,
        deps.logger
    );

    // Create standard engines for retrieval and discovery
    const retrievalDeps: RetrievalEngineDependencies = {
        llm: deps.geminiService,
        embeddingProvider: deps.embeddingProvider,
        chunkRepo: deps.repositories.chunk,
        reranker: deps.reranker,
    };

    const retrievalEngine = new RetrievalEngine(resolvedConfig, retrievalDeps, deps.logger);
    const discoveryEngine = new DiscoveryEngine(resolvedConfig, deps.geminiService, deps.pdfProcessor, deps.logger);

    // 4. Create ContextRAG with injected custom engine
    console.log('\n🔧 ContextRAG başlatılıyor...');

    const contextRAGDeps: ContextRAGDependencies = {
        ingestionEngine: myTurboEngine,
        retrievalEngine,
        discoveryEngine,
        repos: deps.repositories,
    };

    const rag = new ContextRAG(userConfig, contextRAGDeps);

    console.log('✅ ContextRAG, "TurboIngestionEngine" ile başlatıldı.\n');

    // Test (will fail with fake key, but we'll see our custom logs)
    try {
        console.log('Ingest testi yapılıyor...');
        await rag.ingest({
            file: Buffer.from('Deneme dosyası'),
            filename: 'test.pdf'
        });
    } catch (e) {
        // Expected error with fake key, but custom engine logs should appear
        console.log('\n(Beklenen hata - önemli olan üstteki Turbo loglarını görmek)');
        console.log(`Hata: ${(e as Error).message?.substring(0, 100)}...`);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
