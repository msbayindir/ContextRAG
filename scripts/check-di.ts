import { ContextRAGFactory, createContextRAG } from '../src/context-rag.factory.js';
import { ContextRAG } from '../src/context-rag.js';
import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('Verifying Dependency Injection Setup...');

    const prisma: any = new PrismaClient();
    const config = {
        prisma,
        geminiApiKey: 'test-key', // Fake key for instantiation check
    };

    try {
        console.log('1. Testing Factory instantiation (ContextRAGFactory.create)...');
        const factoryRag = ContextRAGFactory.create(config);
        console.log('Factory instantiation success.');

        console.log('2. Testing Factory helper (createContextRAG)...');
        const helperRag = createContextRAG(config);
        console.log('Factory helper instantiation success.');

        // Sanity check
        if (factoryRag instanceof ContextRAG && helperRag instanceof ContextRAG) {
            console.log('OK: All checks passed!');
        } else {
            console.error('FAIL: Instance check failed.');
        }

    } catch (error) {
        console.error('FAIL: Check failed with error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
