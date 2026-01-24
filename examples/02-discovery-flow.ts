/**
 * 02 - Discovery Flow
 * 
 * Use the Discovery Agent to analyze a document and
 * get AI-suggested extraction strategies.
 * 
 * Flow:
 * 1. Discover: AI analyzes the PDF structure
 * 2. Review: See suggested chunk types and prompts
 * 3. Approve: Create a PromptConfig from the strategy
 * 4. Ingest: Use the approved config for extraction
 * 
 * Run: npx tsx examples/02-discovery-flow.ts
 */

import 'dotenv/config';

import { createContextRAG } from '../src/index.js';

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

async function main() {
    console.log('Context-RAG Discovery Flow Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
    });

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // 1. Discover - AI analyzes the document
    console.log('\nStep 1: Discovering document structure...');
    
    const discovery = await rag.discover({
        file: pdfBuffer,
        documentTypeHint: 'Educational', // Optional hint
    });

    console.log('\nDiscovery Results:');
    console.log(`   Document Type: ${discovery.documentType}`);
    console.log(`   Confidence: ${(discovery.confidence * 100).toFixed(1)}%`);
    console.log(`   Page Count: ${discovery.pageCount}`);
    console.log(`   Detected Elements: ${discovery.detectedElements.map(e => e.type).join(', ')}`);

    console.log('\nAI-Generated Special Instructions:');
    console.log('   ' + (discovery.specialInstructions[0]?.slice(0, 200) || 'None') + '...');

    // 2. Review the strategy (optional - you can inspect before approving)
    console.log('\nStep 2: Reviewing strategy...');
    console.log(`   Strategy ID: ${discovery.id}`);
    console.log(`   Status: Pending Approval`);

    // 3. Approve the strategy
    console.log('\nStep 3: Approving strategy...');
    
    const approvedConfig = await rag.approveStrategy(discovery.id);
    console.log(`   Created PromptConfig ID: ${approvedConfig.id}`);

    // 4. Ingest with the approved config
    console.log('\nStep 4: Ingesting with approved strategy...');
    
    const result = await rag.ingest({
        file: pdfBuffer,
        filename: 'test.pdf',
        promptConfigId: approvedConfig.id,
        onProgress: (status) => {
            console.log(`   Batch ${status.current}/${status.total}`);
        },
    });

    console.log(`\n Ingestion Complete!`);
    console.log(`   Chunks: ${result.chunkCount}`);
    console.log(`   Batches: ${result.batchCount}`);

    // Cleanup
    await prisma.$disconnect();
    console.log('\nDone!');
}

main().catch(console.error);






