/**
 * 05 - Custom Extraction
 * 
 * Extract specific content types using custom prompts.
 * Useful when you know exactly what you're looking for.
 * 
 * Examples:
 * - Legal: Extract clauses, definitions, obligations
 * - Medical: Extract diagnoses, medications, dosages
 * - Recipes: Extract ingredients, steps, nutrition info
 * 
 * Run: npx tsx examples/05-custom-extraction.ts
 */

import { createContextRAG } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('📝 Context-RAG Custom Extraction Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        // Map custom types to system types
        chunkTypeMapping: {
            'QUESTION': 'TEXT',
            'ANSWER': 'TEXT',
            'DEFINITION': 'TEXT',
            'FORMULA': 'CODE',
        },
    });

    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Example 1: Educational Content (Q&A extraction)
    console.log('\n📚 Example 1: Educational Content (Q&A)');
    
    const educationalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'educational-content.pdf',
        customPrompt: `
You are extracting educational content. Focus on:

- QUESTION: Multiple choice questions, exam questions, practice problems
- ANSWER: Answers and explanations for questions
- DEFINITION: Key term definitions and concepts
- FORMULA: Mathematical or scientific formulas
- TEXT: Regular explanatory paragraphs

For each chunk, preserve the question number if present.
        `,
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ Created ${educationalResult.chunkCount} educational chunks`);

    // Example 2: Legal Document
    console.log('\n⚖️ Example 2: Legal Document');
    
    const legalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'legal-contract.pdf',
        customPrompt: `
You are extracting legal document content. Identify:

- CLAUSE: Individual contract clauses with section numbers (e.g., "3.1 Payment Terms")
- DEFINITION: Defined terms (e.g., '"Service" means...')
- OBLIGATION: Party obligations and deadlines
- LIABILITY: Liability limitations and indemnification terms
- TEXT: General provisions

Always include section/clause numbers when present.
        `,
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ Created ${legalResult.chunkCount} legal chunks`);

    // Example 3: Medical Document
    console.log('\n🏥 Example 3: Medical Document');
    
    const medicalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'medical-report.pdf',
        customPrompt: `
You are extracting medical/pharmaceutical content. Identify:

- MEDICATION: Drug names, dosages, administration routes
- DIAGNOSIS: Medical diagnoses and conditions
- PROCEDURE: Medical procedures and interventions
- LAB_RESULT: Laboratory test results (as TABLE)
- CONTRAINDICATION: Warnings and contraindications
- TEXT: General medical information

Preserve exact dosages and measurements.
        `,
        onProgress: (s) => console.log(`   Batch ${s.current}/${s.total}`),
    });

    console.log(`   ✅ Created ${medicalResult.chunkCount} medical chunks`);

    // Search with type filtering
    console.log('\n🔍 Searching for specific types...');
    
    const questions = await rag.search({
        query: 'exam questions about metabolism',
        filters: {
            chunkTypes: ['QUESTION'],
        },
        limit: 3,
    });

    console.log(`   Found ${questions.length} QUESTION chunks`);
    questions.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.chunk.displayContent.slice(0, 100)}...`);
    });

    // Cleanup
    await prisma.$disconnect();
    console.log('\n✅ Done!');
}

main().catch(console.error);
