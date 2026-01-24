
import { ContextRAGFactory } from '../src/context-rag.factory.js';
import { ContextRAGConfig } from '../src/types/config.types.js';
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
        console.log('1. Testing legacy instantiation (new ContextRAG)...');
        const legacyRag = new ContextRAG(config);
        console.log('Legacy instantiation success.');

        console.log('2. Testing Factory instantiation (ContextRAGFactory.create)...');
        const factoryRag = ContextRAGFactory.create(config);
        console.log('Factory instantiation success.');

        // Sanity check
        if (legacyRag instanceof ContextRAG && factoryRag instanceof ContextRAG) {
            console.log('✅ All checks passed!');
        } else {
            console.error('❌ Instance check failed.');
        }

    } catch (error) {
        console.error('❌ Check failed with error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
