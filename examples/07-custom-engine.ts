/**
 * 07 - Custom Engine
 * 
 * Advanced: Extend Context-RAG engines with custom logic.
 * 
 * Use cases:
 * - Add logging/metrics before/after ingestion
 * - Integrate with external systems
 * - Custom chunk post-processing
 * - A/B testing different strategies
 * 
 * Run: npx tsx examples/07-custom-engine.ts
 */

import { ContextRAG, type ContextRAGDependencies } from '../src/context-rag.js';
import { IngestionEngine, type IngestionEngineDependencies } from '../src/engines/ingestion.engine.js';
import { RetrievalEngine, type RetrievalEngineDependencies } from '../src/engines/retrieval.engine.js';
import { DiscoveryEngine } from '../src/engines/discovery.engine.js';
import { ContextRAGFactory } from '../src/context-rag.factory.js';
import { PDFProcessor } from '../src/services/pdf.processor.js';
import { createLogger } from '../src/utils/logger.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';
import { createEmbeddingProvider } from '../src/providers/embedding-provider.factory.js';
import { createReranker } from '../src/services/reranker.service.js';
import { createLLMService, createLLMServiceFactory } from '../src/services/llm/llm.factory.js';
import {
    DocumentRepository,
    BatchRepository,
    ChunkRepository,
    PromptConfigRepository,
} from '../src/database/index.js';
import { PrismaClient } from '@prisma/client';
import type { ResolvedConfig } from '../src/types/config.types.js';
import type { IngestOptions, IngestResult } from '../src/types/ingestion.types.js';

// ==============================================
// Custom Ingestion Engine with Metrics
// ==============================================

class MetricsIngestionEngine extends IngestionEngine {
    private metrics = {
        totalIngestions: 0,
        totalChunks: 0,
        averageTimeMs: 0,
    };

    async ingest(options: IngestOptions): Promise<IngestResult> {
        const startTime = Date.now();
        
        console.log(' [METRICS] Starting ingestion...');
        console.log(`   File: ${options.filename || 'unknown'}`);

        // Call parent implementation
        const result = await super.ingest(options);

        // Update metrics
        const duration = Date.now() - startTime;
        this.metrics.totalIngestions++;
        this.metrics.totalChunks += result.chunkCount;
        this.metrics.averageTimeMs = 
            (this.metrics.averageTimeMs * (this.metrics.totalIngestions - 1) + duration) 
            / this.metrics.totalIngestions;

        console.log(' [METRICS] Ingestion complete:');
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Chunks created: ${result.chunkCount}`);
        console.log(`   Total ingestions: ${this.metrics.totalIngestions}`);
        console.log(`   Total chunks: ${this.metrics.totalChunks}`);
        console.log(`   Avg time: ${this.metrics.averageTimeMs.toFixed(0)}ms`);

        return result;
    }

    getMetrics() {
        return { ...this.metrics };
    }
}

// ==============================================
// Helper: Create all dependencies manually
// ==============================================

function createDependencies(config: any): { 
    resolvedConfig: ResolvedConfig; 
    ingestionDeps: IngestionEngineDependencies;
    retrievalDeps: RetrievalEngineDependencies;
    logger: ReturnType<typeof createLogger>;
} {
    // Resolve config using factory's internal method
    const resolvedConfig = (ContextRAGFactory as any).resolveConfig(config) as ResolvedConfig;
    const logger = createLogger(resolvedConfig.logging);
    const rateLimiter = new RateLimiter(resolvedConfig.rateLimitConfig);

    // Create services
    const llmService = createLLMService(resolvedConfig, logger);
    const llmFactory = createLLMServiceFactory();
    const pdfProcessor = new PDFProcessor(logger);
    const embeddingProvider = createEmbeddingProvider(resolvedConfig, rateLimiter, logger);
    const reranker = createReranker(resolvedConfig, llmService, logger);

    // Create repositories
    const repositories = {
        document: new DocumentRepository(resolvedConfig.prisma),
        batch: new BatchRepository(resolvedConfig.prisma),
        chunk: new ChunkRepository(resolvedConfig.prisma),
        promptConfig: new PromptConfigRepository(resolvedConfig.prisma),
    };

    return {
        resolvedConfig,
        logger,
        ingestionDeps: {
            llm: llmService,
            llmFactory,
            pdfProcessor,
            embeddingProvider,
            repositories,
        },
        retrievalDeps: {
            llm: llmService,
            embeddingProvider,
            chunkRepo: repositories.chunk,
            reranker,
        },
    };
}

// ==============================================
// Main
// ==============================================

async function main() {
    console.log('Context-RAG Custom Engine Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient() as any;

    const config = {
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        logging: { level: 'info' as const },
    };

    // Create dependencies
    const { resolvedConfig, ingestionDeps, retrievalDeps, logger } = createDependencies(config);

    // Create custom ingestion engine
    console.log('\\nCreating custom MetricsIngestionEngine...');
    const customIngestion = new MetricsIngestionEngine(
        resolvedConfig,
        ingestionDeps,
        logger
    );

    // Create standard engines
    const retrievalEngine = new RetrievalEngine(resolvedConfig, retrievalDeps, logger);
    const discoveryEngine = new DiscoveryEngine(
        resolvedConfig,
        ingestionDeps.llm,
        ingestionDeps.pdfProcessor,
        logger
    );

    // Create ContextRAG with custom engine
    console.log('Creating ContextRAG with injected custom engine...\n');
    
    const contextRAGDeps: ContextRAGDependencies = {
        ingestionEngine: customIngestion,
        retrievalEngine,
        discoveryEngine,
        repos: {
            promptConfig: ingestionDeps.repositories.promptConfig,
            document: ingestionDeps.repositories.document,
            chunk: ingestionDeps.repositories.chunk,
        },
    };

    const rag = new ContextRAG(config, contextRAGDeps);

    // Test the custom engine
    console.log('Testing ingestion with custom engine...\n');
    
    try {
        await rag.ingest({
            file: Buffer.from('Test PDF content'),
            filename: 'test-custom.pdf',
        });
    } catch (e) {
        // Expected to fail with fake content, but metrics should be logged
        console.log('\n(Expected error with test content)');
    }

    // Get metrics from custom engine
    const metrics = customIngestion.getMetrics();
    console.log('\\nFinal Metrics:', metrics);

    await prisma.$disconnect();
    console.log('\\nDone!');
}

main().catch(console.error);


