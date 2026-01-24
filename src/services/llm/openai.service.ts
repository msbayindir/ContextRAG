import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Part } from '@google/generative-ai';
import type { z } from 'zod';
import type { TokenUsage } from '../../types/chunk.types.js';
import type {
    ILLMService,
    LLMGenerateOptions,
    LLMResponse,
    LLMStructuredResult,
} from '../../types/llm-service.types.js';
import { ConfigurationError, GeminiAPIError, RateLimitError } from '../../errors/index.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import type { Logger } from '../../utils/logger.js';

export interface OpenAILLMConfig {
    apiKey: string;
    model?: string;
}

export class OpenAILLMService implements ILLMService {
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: OpenAILLMConfig, rateLimiter: RateLimiter, logger: Logger) {
        if (!config.apiKey) {
            throw new ConfigurationError('OpenAI API key is required', { provider: 'openai' });
        }

        this.client = new OpenAI({ apiKey: config.apiKey });
        this.model = config.model ?? 'gpt-4o-mini';
        this.rateLimiter = rateLimiter;
        this.logger = logger;
    }

    async generate(
        systemPrompt: string,
        userContent: string,
        options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        await this.rateLimiter.acquire();

        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                temperature: options?.temperature,
                max_tokens: options?.maxOutputTokens,
            });

            this.rateLimiter.reportSuccess();

            const text = response.choices[0]?.message?.content ?? '';
            return {
                text,
                tokenUsage: this.mapUsage(response.usage, text),
            };
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    async generateWithVision(
        _systemPrompt: string,
        _parts: Part[],
        _options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        throw new ConfigurationError('OpenAI vision generation is not implemented', {
            provider: 'openai',
            capability: 'vision',
        });
    }

    async generateSimple(prompt: string): Promise<string> {
        const response = await this.generate('', prompt);
        return response.text.trim();
    }

    async generateForReranking(prompt: string): Promise<string> {
        const response = await this.generate('', prompt, { temperature: 0.1, maxOutputTokens: 2048 });
        return response.text.trim();
    }

    async uploadDocument(_buffer: Buffer, _filename: string): Promise<string> {
        throw new ConfigurationError('OpenAI document upload is not supported', {
            provider: 'openai',
            capability: 'document_upload',
        });
    }

    async generateWithDocument(
        _documentUri: string,
        _prompt: string,
        _options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        throw new ConfigurationError('OpenAI document generation is not supported', {
            provider: 'openai',
            capability: 'document_generate',
        });
    }

    async generateStructured<T>(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        const maxRetries = options?.maxRetries ?? 2;
        let attempt = 0;
        let lastError: Error | undefined;

        const schemaJson = JSON.stringify(zodToJsonSchema(schema), null, 2);
        const structuredPrompt = `${prompt}\n\nReturn ONLY valid JSON matching this schema:\n${schemaJson}\n\nJSON:`;

        while (attempt <= maxRetries) {
            attempt++;
            try {
                const response = await this.generate('', structuredPrompt, options);
                const data = schema.parse(JSON.parse(response.text));
                return { data, tokenUsage: response.tokenUsage };
            } catch (error) {
                lastError = error as Error;
                this.logger.warn('OpenAI structured output validation failed', {
                    attempt,
                    error: lastError.message,
                });
            }
        }

        throw lastError ?? new Error('OpenAI structured output failed');
    }

    async generateStructuredWithDocument<T>(
        _documentUri: string,
        _prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _schema: z.ZodType<T, any, any>,
        _options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        throw new ConfigurationError('OpenAI document structured generation is not supported', {
            provider: 'openai',
            capability: 'document_structured',
        });
    }

    private mapUsage(
        usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined,
        text: string
    ): TokenUsage {
        if (!usage) {
            const estimated = Math.ceil(text.length / 4);
            return { input: estimated, output: estimated, total: estimated * 2 };
        }

        const input = usage.prompt_tokens ?? 0;
        const output = usage.completion_tokens ?? 0;
        return {
            input,
            output,
            total: usage.total_tokens ?? input + output,
        };
    }

    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('OpenAI API rate limit exceeded');
        }

        if (message.includes('invalid_api_key') || message.includes('authentication')) {
            throw new GeminiAPIError('Invalid OpenAI API key', {
                statusCode: 401,
                retryable: false,
            });
        }

        this.logger.error('OpenAI API error', {
            error: error.message,
        });
    }
}
