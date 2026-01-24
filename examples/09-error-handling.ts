/**
 * 09 - Error Handling
 * 
 * Production-grade error handling patterns for Context-RAG.
 * 
 * Features:
 * - Custom error classes with context
 * - Correlation IDs for tracing
 * - Retryable vs non-retryable errors
 * - Graceful degradation
 * 
 * Run: npx tsx examples/09-error-handling.ts
 */

import { createContextRAG } from '../src/index.js';
import {
    IngestionError,
    RerankingError,
    ConfigurationError,
    RateLimitError,
    NotFoundError,
    generateCorrelationId,
    setCorrelationId,
} from '../src/index.js';
import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('🛡️ Context-RAG Error Handling Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
    });

    // 1. Correlation IDs for Tracing
    console.log('\n📌 1. Correlation IDs');
    
    const correlationId = generateCorrelationId();
    setCorrelationId(correlationId);
    
    console.log(`   Generated: ${correlationId}`);
    console.log('   All logs and errors now include this ID');
    console.log('   Format: crag_{timestamp}_{random}');

    // 2. Error Handling Pattern
    console.log('\n📌 2. Error Handling Patterns');

    // Example: Ingestion Error
    console.log('\n   Testing IngestionError handling...');
    try {
        await rag.ingest({
            file: Buffer.from('not a valid pdf'),
            filename: 'invalid.pdf',
        });
    } catch (error) {
        if (error instanceof IngestionError) {
            console.log(`   ✅ Caught IngestionError:`);
            console.log(`      Message: ${error.message}`);
            console.log(`      Correlation ID: ${error.correlationId}`);
            console.log(`      Retryable: ${error.retryable}`);
            console.log(`      Batch Index: ${error.batchIndex ?? 'N/A'}`);
        } else {
            console.log(`   ❌ Unexpected error: ${(error as Error).message}`);
        }
    }

    // Example: Not Found Error
    console.log('\n   Testing NotFoundError handling...');
    try {
        // Simulate a NotFoundError
        throw new NotFoundError('Document', 'non-existent-id');
    } catch (error) {
        if (error instanceof NotFoundError) {
            console.log(`   ✅ Caught NotFoundError:`);
            console.log(`      Message: ${error.message}`);
            console.log(`      Resource Type: ${error.resourceType}`);
            console.log(`      ID: ${error.resourceId}`);
        }
    }

    // 3. Health Check
    console.log('\n📌 3. Health Check (Proactive Error Detection)');
    
    const health = await rag.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   Database: ${health.database ? '✅' : '❌'}`);
    console.log(`   pgvector: ${health.pgvector ? '✅' : '❌'}`);

    if (!health.database) {
        console.log('   ⚠️ Database connection failed!');
    }
    if (!health.pgvector) {
        console.log('   ⚠️ pgvector extension not installed!');
    }

    // 4. Retry Pattern
    console.log('\n📌 4. Retry Pattern for Transient Errors');
    
    async function ingestWithRetry(
        rag: any,
        options: any,
        maxRetries = 3
    ): Promise<any> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   Attempt ${attempt}/${maxRetries}...`);
                return await rag.ingest(options);
            } catch (error) {
                lastError = error as Error;
                
                // Check if error is retryable
                if (error instanceof RateLimitError) {
                    console.log(`   Rate limited. Waiting ${error.retryAfterMs}ms...`);
                    await new Promise(r => setTimeout(r, error.retryAfterMs));
                    continue;
                }
                
                if (error instanceof IngestionError && error.retryable) {
                    console.log(`   Retryable error. Waiting 1s...`);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                
                // Non-retryable error, throw immediately
                throw error;
            }
        }
        
        throw lastError;
    }

    console.log('   Retry function defined. Example usage:');
    console.log('   // const result = await ingestWithRetry(rag, { file, filename });');
    void ingestWithRetry; // Mark as used

    // 5. Graceful Degradation
    console.log('\n📌 5. Graceful Degradation Pattern');
    
    async function searchWithFallback(
        rag: any,
        query: string
    ): Promise<any[]> {
        try {
            // Try hybrid search with reranking (best quality)
            return await rag.search({
                query,
                mode: 'hybrid',
                useReranking: true,
            });
        } catch (error) {
            if (error instanceof RerankingError) {
                console.log('   ⚠️ Reranking failed, falling back to basic search');
                // Fallback: hybrid without reranking
                return await rag.search({
                    query,
                    mode: 'hybrid',
                    useReranking: false,
                });
            }
            
            // Further fallback: semantic only
            console.log('   ⚠️ Hybrid failed, falling back to semantic search');
            return await rag.search({
                query,
                mode: 'semantic',
                useReranking: false,
            });
        }
    }

    console.log('   Graceful degradation function defined. Example usage:');
    console.log('   // const results = await searchWithFallback(rag, "my query");');
    void searchWithFallback; // Mark as used

    // 6. Configuration Validation
    console.log('\n📌 6. Configuration Validation');
    
    try {
        // This will throw ConfigurationError
        createContextRAG({
            prisma,
            geminiApiKey: '', // Empty API key
        });
    } catch (error) {
        if (error instanceof ConfigurationError) {
            console.log(`   ✅ Caught ConfigurationError:`);
            console.log(`      Message: ${error.message}`);
            console.log(`      Code: ${error.code}`);
        }
    }

    // Cleanup
    await prisma.$disconnect();
    console.log('\n✅ Done!');
}

main().catch(console.error);
