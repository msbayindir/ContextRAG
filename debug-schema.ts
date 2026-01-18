
import { z } from 'zod';
import { zodToGeminiSchema } from './src/schemas/structured-output.schemas.js';

const TestSchema = z.object({
    name: z.string(),
    tags: z.array(z.string()),
    details: z.object({
        age: z.number(),
        metadata: z.record(z.string())
    })
});

console.log('--- Generated Schema ---');
const generated = zodToGeminiSchema(TestSchema);
console.log(JSON.stringify(generated, null, 2));

function checkForForbidden(obj: any, path = '') {
    if (!obj || typeof obj !== 'object') return;

    if (obj.additionalProperties !== undefined) {
        console.error(`FOUND forbidden 'additionalProperties' at ${path}`);
    }
    if (obj.$schema !== undefined) {
        console.error(`FOUND forbidden '$schema' at ${path}`);
    }

    for (const key in obj) {
        checkForForbidden(obj[key], `${path}.${key}`);
    }
}

console.log('--- Checking for Forbidden Fields ---');
checkForForbidden(generated);
