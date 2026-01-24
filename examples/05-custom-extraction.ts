/**
 * 05 - Custom Extraction with SubTypes & Domains
 * 
 * Extract specific content types using custom prompts.
 * Custom types are automatically preserved in `subType` field for filtering.
 * 
 * Features:
 * - Custom types (CLAUSE, MEDICATION, etc.)  stored in subType
 * - Domain categorization (legal, medical, educational)
 * - Efficient B-tree index filtering
 * 
 * Examples:
 * - Legal: Extract clauses, definitions, obligations
 * - Medical: Extract diagnoses, medications, dosages
 * - Recipes: Extract ingredients, steps, nutrition info
 * 
 * Run: npx tsx examples/05-custom-extraction.ts
 */

import 'dotenv/config';

import { createContextRAG } from '../src/index.js';

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

async function main() {
    console.log('Context-RAG Custom Extraction Example\n');
    console.log('='.repeat(50));

    const prisma = new PrismaClient();
    
    const rag = createContextRAG({
        prisma,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        // Map custom types to standard ChunkType (optional)
        // Custom types are preserved in subType for filtering
        chunkTypeMapping: {
            'QUESTION': 'TEXT',
            'ANSWER': 'TEXT',
            'DEFINITION': 'TEXT',
            'FORMULA': 'CODE',
            'CLAUSE': 'TEXT',
            'MEDICATION': 'TEXT',
            'DIAGNOSIS': 'TEXT',
        },
    });

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pdfPath = path.join(__dirname, 'test.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    // Example 1: Educational Content (Q&A extraction)
    console.log('\nExample 1: Educational Content (Q&A)');
    
    const educationalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'educational-content.pdf',
        domain: 'educational', // Domain for categorization
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

    console.log(`    Created ${educationalResult.chunkCount} educational chunks`);

    // Example 2: Legal Document
    console.log('\nExample 2: Legal Document');
    
    const legalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'legal-contract.pdf',
        domain: 'legal', // Domain for categorization
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

    console.log(`    Created ${legalResult.chunkCount} legal chunks`);

    // Example 3: Medical Document
    console.log('\nExample 3: Medical Document');
    
    const medicalResult = await rag.ingest({
        file: pdfBuffer,
        filename: 'medical-report.pdf',
        domain: 'medical', // Domain for categorization
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

    console.log(`    Created ${medicalResult.chunkCount} medical chunks`);

    // Search with subType filtering (NEW FEATURE!)
    console.log('\nSearching by subType (custom types)...');
    
    // Find all CLAUSE chunks from legal documents
    const clauses = await rag.search({
        query: 'payment terms and conditions',
        filters: {
            subTypes: ['CLAUSE', 'OBLIGATION'], // Filter by custom sub-types
            domains: ['legal'], // Filter by domain
        },
        limit: 3,
    });

    console.log(`   Found ${clauses.length} legal clauses`);
    clauses.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.subType}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // Search for medications in medical domain
    console.log('\nSearching for medications...');
    
    const medications = await rag.search({
        query: 'drug dosage administration',
        filters: {
            subTypes: ['MEDICATION', 'CONTRAINDICATION'],
            domains: ['medical'],
        },
        limit: 3,
    });

    console.log(`   Found ${medications.length} medication chunks`);
    medications.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.subType}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // Search for exam questions in educational domain
    console.log('\nSearching for exam questions...');
    
    const questions = await rag.search({
        query: 'exam questions about metabolism',
        filters: {
            subTypes: ['QUESTION', 'ANSWER'],
            domains: ['educational'],
        },
        limit: 3,
    });

    console.log(`   Found ${questions.length} question/answer chunks`);
    questions.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.subType}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // Cross-domain search for definitions
    console.log('\nCross-domain search for definitions...');
    
    const definitions = await rag.search({
        query: 'definition meaning terminology',
        filters: {
            subTypes: ['DEFINITION'], // Search across all domains
        },
        limit: 5,
    });

    console.log(`   Found ${definitions.length} definitions from all domains`);
    definitions.forEach((r, i) => {
        console.log(`   ${i + 1}. [${r.chunk.domain}] ${r.chunk.displayContent.slice(0, 80)}...`);
    });

    // Cleanup
    await prisma.$disconnect();
    console.log('\nDone!');
}

main().catch(console.error);






