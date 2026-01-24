/* global fetch */
import type { Part } from '@google/generative-ai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { TokenUsage } from '../../types/chunk.types.js';
import type {
    ILLMService,
    LLMGenerateOptions,
    LLMResponse,
    LLMStructuredResult,
} from '../../types/llm-service.types.js';
import { ConfigurationError, RateLimitError } from '../../errors/index.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import type { Logger } from '../../utils/logger.js';

export interface AnthropicLLMConfig {
    apiKey: string;
    model?: string;
}

export class AnthropicLLMService implements ILLMService {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: Logger;

    constructor(config: AnthropicLLMConfig, rateLimiter: RateLimiter, logger: Logger) {
        if (!config.apiKey) {
            throw new ConfigurationError('Anthropic API key is required', { provider: 'anthropic' });
        }

        this.apiKey = config.apiKey;
        this.model = config.model ?? 'claude-3-5-sonnet-20240620';
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
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    system: systemPrompt,
                    max_tokens: options?.maxOutputTokens ?? 1024,
                    temperature: options?.temperature,
                    messages: [{ role: 'user', content: userContent }],
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
            }

            const data = await response.json() as {
                content?: Array<{ text?: string }>;
                usage?: { input_tokens?: number; output_tokens?: number };
            };

            this.rateLimiter.reportSuccess();

            const text = data.content?.[0]?.text ?? '';
            return {
                text,
                tokenUsage: this.mapUsage(data.usage, text),
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
        throw new ConfigurationError('Anthropic vision generation is not implemented', {
            provider: 'anthropic',
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
        throw new ConfigurationError('Anthropic document upload is not supported', {
            provider: 'anthropic',
            capability: 'document_upload',
        });
    }

    async generateWithDocument(
        _documentUri: string,
        _prompt: string,
        _options?: LLMGenerateOptions
    ): Promise<LLMResponse> {
        throw new ConfigurationError('Anthropic document generation is not supported', {
            provider: 'anthropic',
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
                this.logger.warn('Anthropic structured output validation failed', {
                    attempt,
                    error: lastError.message,
                });
            }
        }

        throw lastError ?? new Error('Anthropic structured output failed');
    }

    async generateStructuredWithDocument<T>(
        _documentUri: string,
        _prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _schema: z.ZodType<T, any, any>,
        _options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        throw new ConfigurationError('Anthropic document structured generation is not supported', {
            provider: 'anthropic',
            capability: 'document_structured',
        });
    }

    private mapUsage(
        usage: { input_tokens?: number; output_tokens?: number } | undefined,
        text: string
    ): TokenUsage {
        if (!usage) {
            const estimated = Math.ceil(text.length / 4);
            return { input: estimated, output: estimated, total: estimated * 2 };
        }

        const input = usage.input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        return { input, output, total: input + output };
    }

    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('Anthropic API rate limit exceeded');
        }

        this.logger.error('Anthropic API error', {
            error: error.message,
        });
    }
}
