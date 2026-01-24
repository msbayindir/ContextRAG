import { z } from 'zod';
import { zodToGeminiSchema } from '../../schemas/structured-output.schemas.js';
import type { TokenUsage } from '../../types/chunk.types.js';
import type { Logger } from '../../utils/logger.js';
import { GeminiApiClient } from './gemini.client.js';

export class StructuredGenerator {
    constructor(
        private readonly client: GeminiApiClient,
        private readonly logger: Logger
    ) { }

    async generate<T>(
        systemPrompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            maxRetries?: number;
            pdfUri?: string;
        }
    ): Promise<{ data: T; tokenUsage: TokenUsage }> {
        const maxRetries = options?.maxRetries ?? 2;
        let attempt = 0;
        let lastError: Error | undefined;

        // Build initial contents
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contents: any[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [];
        if (options?.pdfUri) {
            parts.push({ fileData: { mimeType: 'application/pdf', fileUri: options.pdfUri } });
        }
        parts.push({ text: systemPrompt });

        contents.push({
            role: 'user',
            parts: parts,
        });

        // Clone contents to build conversation history for feedback loop
        const currentContents = [...contents];

        while (attempt <= maxRetries) {
            attempt++;

            // We do NOT acquire rate limiter here because the client handles it per request
            // However, for logical retries (validation failure), we are making new requests.

            const response = await this.client.generateContent(currentContents, {
                temperature: options?.temperature ?? 0.2, // Low temp for structured
                maxOutputTokens: options?.maxOutputTokens,
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: zodToGeminiSchema(schema) as any,
            });

            const text = response.text;

            try {
                const parsed = JSON.parse(text);
                const data = schema.parse(parsed);
                return {
                    data,
                    tokenUsage: response.tokenUsage
                };
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                const snippet = text.length > 500 ? text.substring(0, 200) + '...[truncated]...' + text.substring(text.length - 200) : text;

                this.logger.warn(`Structured validation failed (attempt ${attempt}/${maxRetries + 1})`, {
                    error: errorMessage,
                    snippet: text.substring(0, 100)
                });

                lastError = new Error(`Structured output validation failed: ${errorMessage}. Raw response snippet: ${snippet}`);

                if (attempt <= maxRetries) {
                    // FEEDBACK LOOP: Add the failed response and the error message to history
                    currentContents.push({
                        role: 'model',
                        parts: [{ text: text }]
                    });

                    currentContents.push({
                        role: 'user',
                        parts: [{ text: `JSON Validation Error: ${errorMessage}\n\nPlease fix the JSON output to match the schema exactly.` }]
                    });

                    continue;
                }
                throw lastError;
            }
        }
        throw lastError;
    }
}
