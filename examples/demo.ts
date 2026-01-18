/**
 * Context-RAG End-to-End Demo
 * 
 * This demo showcases the new template-based prompt system:
 * - Discovery returns specialInstructions and exampleFormats
 * - Ingestion uses buildExtractionPrompt() for consistent output
 * - AI outputs structured <!-- SECTION --> markers
 * - Chunk parsing with parseSections() for reliable extraction
 * 
 * Prerequisites:
 * 1. PostgreSQL with pgvector extension
 * 
 * 2. GEMINI_API_KEY environment variable
 * 3. DATABASE_URL environment variable
 * 
 * Usage:
 *   npx tsx examples/demo.ts
 */

import { ContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// Sample biochemistry text for testing (TUS exam questions)
const SAMPLE_BIOCHEMISTRY_TEXT = `
BİYOKİMYA'DA ÇIKMIŞ TUS SORU SPOTLARI -1

METABOLİZMANIN TEMEL KAVRAMLARI

1. METABOLİZMAYA GİRİŞ

Biyokimyasal öneme sahip molekülerden açığa çıkan ΔG0:

| Bileşik | ΔG0 kcal/mol |
|---------|--------------|
| Fosfoenol pirüvat | -14.8 |
| Karbamoil fosfat | -12.3 |
| 1,3-Bifosfogliserat → 3-Fosfogliserat | -11.8 |
| Kreatin fosfat | -10.3 |
| ATP → ADP + Pi | -7.3 |
| ADP → AMP + Pi | -6.6 |
| Glukoz-6-fosfat | -3.3 |

**Soru 1:** Diğerlerine göre en yüksek negatif değere sahip olan yüksek enerjili bileşik hangisidir?
A) ATP
B) Kreatin fosfat
C) Fosfoenol pirüvat
D) Glukoz-6-fosfat
E) ADP
**Cevap:** C) Fosfoenol pirüvat

**Soru 2:** ADP'den ATP sentezlemeye yetmeyen bileşik hangisidir?
A) Fosfoenol pirüvat
B) Kreatin fosfat
C) 1,3-Bifosfogliserat
D) Gliserol-3-fosfat
E) Karbamoil fosfat
**Cevap:** D) Gliserol-3-fosfat

2. ELEKTRON TRANSPORT ZİNCİRİ

Elektron Transport Zinciri Kompleksleri:

| Kompleks | Enzim | Prostetik Grup |
|----------|-------|----------------|
| I | NADH dehidrojenaz | FMN, Fe-S |
| II | Süksinat dehidrojenaz | FAD, Fe-S |
| III | Ubikinon-sitokrom C oksidoredüktaz | Hem, Fe-S |
| IV | Sitokrom oksidaz | Hem, bakır |
| V | ATP sentez | - |

ETZ İnhibitörleri:
- Rotenon, Amobarbital → Kompleks I inhibisyonu
- TTFA, Karboksin, Malonat → Kompleks II inhibisyonu
- Antimisin A → Kompleks III inhibisyonu
- Siyanür, Karbonmonoksit → Kompleks IV inhibisyonu
`;

// Check environment variables
if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is required');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

async function main() {
    console.log('🧠 Context-RAG Demo - Template-Based Prompt System\n');
    console.log('='.repeat(60));

    // Initialize Prisma
    console.log('\n📦 Initializing Prisma...');
    const prisma = new PrismaClient();

    try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected');

        // Check pgvector
        try {
            await prisma.$queryRaw`SELECT * FROM pg_extension WHERE extname = 'vector'`;
            console.log('✅ pgvector extension found');
        } catch {
            console.log('⚠️  pgvector extension not found, trying to install...');
            await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
            console.log('✅ pgvector extension installed');
        }
    } catch (error) {
        console.error('❌ Database connection failed:', (error as Error).message);
        process.exit(1);
    }

    // Initialize Context-RAG
    console.log('\n🔧 Initializing Context-RAG...');
    const rag = new ContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-3-pro-preview',  // Main model for PDF extraction (best quality)
        generationConfig: {
            temperature: 0.2, // Lower temperature for accurate extraction
            maxOutputTokens: 8192 * 2 * 4,
        },
        // NEW: Enable Contextual Retrieval Enhancement with separate model
        ragEnhancement: {
            approach: 'anthropic_contextual',
            strategy: 'llm',
            model: 'gemini-2.5-flash',  // Faster model for context generation (high RPM)
            skipChunkTypes: ['HEADING', 'IMAGE_REF', 'TABLE', 'CODE', 'QUOTE', 'MIXED', 'QUESTION', 'LIST'],
        },
        batchConfig: {
            pagesPerBatch: 15,
            maxConcurrency: 3,
        },
        logging: {
            level: 'debug',
            structured: false,
        },
    });

    // Health check
    console.log('\n🏥 Running health check...');
    const health = await rag.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   Database: ${health.database ? '✅' : '❌'}`);
    console.log(`   pgvector: ${health.pgvector ? '✅' : '❌'}`);

    if (health.status === 'unhealthy') {
        console.error('❌ System is unhealthy, exiting...');
        await prisma.$disconnect();
        process.exit(1);
    }

    // Check for test PDF
    const testPdfPath = path.join(process.cwd(), 'examples', 'test.pdf');
    let pdfBuffer: Buffer;
    let hasPdf = false;

    try {
        pdfBuffer = await fs.readFile(testPdfPath);
        console.log(`\n📄 Found test PDF: ${testPdfPath}`);
        hasPdf = true;
    } catch {
        console.log('\n⚠️  No test.pdf found in examples folder');
        console.log('   Showing template system demo with sample text...\n');
    }

    // ========================================
    // JSON SCHEMA DEMO
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('🏗️  JSON SCHEMA DEMO');
    console.log('='.repeat(60));

    // Show updated expected output
    console.log('\n📋 Expected AI Output Format (Native JSON):');
    console.log('-'.repeat(40));
    console.log(`
[
  {
    "type": "HEADING",
    "page": 1,
    "confidence": 0.99,
    "content": "# 1. METABOLİZMAYA GİRİŞ"
  },
  {
    "type": "TABLE",
    "page": 1,
    "confidence": 0.95,
    "content": "| Bileşik | ΔG0 kcal/mol |...| Fosfoenol pirüvat | -14.8 |..."
  },
  {
    "type": "QUESTION",
    "page": 1,
    "confidence": 0.98,
    "content": "**Soru 1:** Diğerlerine göre en yüksek negatif değere sahip olan...?"
  }
]
`);

    // ========================================
    // DISCOVERY DEMO (if PDF exists)
    // ========================================
    if (hasPdf) {
        console.log('\n' + '='.repeat(60));
        console.log('🔍 DISCOVERY DEMO');
        console.log('='.repeat(60));

        let discovery;
        let promptConfig;

        try {
            console.log('\n   Analyzing document...');
            discovery = await rag.discover({
                file: pdfBuffer!,
                documentTypeHint: 'Medical' // Hint for biochemistry content
            });

            console.log(`\n   📋 Discovery Results:`);
            console.log(`      ID: ${discovery.id}`);
            console.log(`      Document Type: ${discovery.documentType}`);
            console.log(`      Confidence: ${(discovery.confidence * 100).toFixed(1)}%`);
            console.log(`      Page Count: ${discovery.pageCount}`);

            // NEW: Show specialInstructions
            console.log(`\n   📝 Special Instructions (NEW!):`);
            if (discovery.specialInstructions && discovery.specialInstructions.length > 0) {
                discovery.specialInstructions.forEach((instruction, i) => {
                    console.log(`      ${i + 1}. ${instruction}`);
                });
            } else {
                console.log(`      (None detected, using defaults)`);
            }

            // NEW: Show exampleFormats
            if (discovery.exampleFormats && discovery.exampleFormats.length > 0) {
                console.log(`\n   📐 Example Formats (NEW!):`);
                // Check if it's array (new schema) or record (legacy mock fallback if any)
                if (Array.isArray(discovery.exampleFormats)) {
                    for (const example of discovery.exampleFormats) {
                        console.log(`      ${example.element}: ${example.format}`);
                    }
                } else {
                    // Fallback check just in case type is loose
                    for (const [key, value] of Object.entries(discovery.exampleFormats)) {
                        console.log(`      ${key}: ${value}`);
                    }
                }
            }

            console.log(`\n   🎯 Chunk Strategy:`);
            console.log(`      Max Tokens: ${discovery.suggestedChunkStrategy.maxTokens}`);
            console.log(`      Split By: ${discovery.suggestedChunkStrategy.splitBy}`);
            console.log(`      Preserve Tables: ${discovery.suggestedChunkStrategy.preserveTables}`);
            console.log(`      Preserve Lists: ${discovery.suggestedChunkStrategy.preserveLists}`);

            if (discovery.detectedElements.length > 0) {
                console.log(`\n   🔎 Detected Elements:`);
                discovery.detectedElements.forEach(el => {
                    console.log(`      - ${el.type}: ${el.count}`);
                });
            }

            // Approve strategy
            console.log('\n   ✅ Approving strategy...');
            promptConfig = await rag.approveStrategy(discovery.id);
            console.log(`      Created Prompt Config: ${promptConfig.id}`);
            console.log(`      Document Type: ${promptConfig.documentType}`);

            // ========================================
            // INGESTION DEMO
            // ========================================
            console.log('\n' + '='.repeat(60));
            console.log('📥 INGESTION DEMO');
            console.log('='.repeat(60));

            console.log('\n   Processing document with template-based extraction...\n');

            // Generate experiment ID from model name
            const experimentId = `exp_${rag.getConfig().model.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`;
            console.log(`   🧪 Experiment ID: ${experimentId}\n`);

            const result = await rag.ingest({
                file: pdfBuffer!,
                filename: 'test.pdf',
                documentType: discovery.documentType,
                promptConfigId: promptConfig.id,
                experimentId,  // NEW: Allows same PDF with different models
                skipExisting: true,  // Now checks hash + experimentId
                onProgress: (status) => {
                    const progress = `${status.current}/${status.total}`;
                    const pages = status.pageRange
                        ? `pages ${status.pageRange.start}-${status.pageRange.end}`
                        : '';
                    console.log(`   📦 Batch ${progress} ${status.status} ${pages}`);
                },
            });

            console.log(`\n   ✅ Ingestion Complete!`);
            console.log(`      Document ID: ${result.documentId}`);
            console.log(`      Status: ${result.status}`);
            console.log(`      Chunks Created: ${result.chunkCount}`);
            console.log(`      Batches: ${result.batchCount}`);
            console.log(`      Failed Batches: ${result.failedBatchCount}`);
            console.log(`      Processing Time: ${result.processingMs}ms`);
            console.log(`      Token Usage:`);
            console.log(`        Input: ${result.tokenUsage.input}`);
            console.log(`        Output: ${result.tokenUsage.output}`);
            console.log(`        Total: ${result.tokenUsage.total}`);

            // ========================================
            // SEARCH DEMO
            // ========================================
            console.log('\n' + '='.repeat(60));
            console.log('🔎 SEARCH DEMO');
            console.log('='.repeat(60));

            const queries = [
                'Elektron transport zinciri kompleksleri nelerdir?',
                'Siyanür hangi kompleksi inhibe eder?',
                'En yüksek enerjili bileşik hangisidir?',
            ];

            for (const query of queries) {
                console.log(`\n   Query: "${query}"`);

                const searchResults = await rag.search({
                    query,
                    limit: 3,
                    mode: 'hybrid',
                    includeExplanation: true,
                });

                if (searchResults.length === 0) {
                    console.log('   No results found');
                } else {
                    searchResults.forEach((r, i) => {
                        console.log(`\n   [${i + 1}] Score: ${r.score.toFixed(3)}`);
                        console.log(`       Type: ${r.chunk.chunkType}`);
                        console.log(`       Content: ${r.chunk.displayContent.slice(0, 150)}...`);

                        // Show if parsed with structured markers
                        const metadata = r.chunk.metadata as { parsedWithStructuredMarkers?: boolean };
                        if (metadata?.parsedWithStructuredMarkers) {
                            console.log(`       ✅ Parsed with structured output (Native JSON)`);
                        }
                    });
                }
            }

        } catch (error) {
            console.error('   ❌ Error:', (error as Error).message);
        }
    }

    // Final Summary Update
    console.log('\n' + '='.repeat(60));
    console.log('📚 SYSTEM SUMMARY');
    console.log('='.repeat(60));

    console.log(`
   🆕 New Features in this Version:
   
   1. 🚀 Gemini Files API Integration
      - Full PDF uploaded once & cached by Google
      - Used for both Discovery and Ingestion (No more base64 payload limits)
      - Massive context window support (2M+ tokens)
   
   2. 🧠 Contextual Retrieval (Anthropic-style)
      - Each chunk gets a generated "Context" describing its location in the doc
      - Solves "Lost in Middle" problem for isolated chunks (e.g., tables)
      - Hybrid Search (Semantic + Keyword) + Type Boosting
   
   3. 💎 Native Structured Output (JSON Schema)
      - No more regex parsing or "XML marker" hallucinations
      - 100% Type-safe extraction using Gemini's responseSchema
      - Robust fallback to legacy parser if needed
   
   4. ⚡ Parallel Batch Processing
      - Reliable concurrent execution
      - Robust error handling and retry mechanisms
`);

    // Cleanup
    console.log('\n✨ Demo complete!');
    await prisma.$disconnect();
}

main().catch(console.error);
