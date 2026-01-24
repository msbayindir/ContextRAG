import type {
    ILLMService,
    ITextLLMService,
    IRerankLLMService,
    IDocumentLLMService,
    IStructuredLLMService,
    LLMGenerateOptions,
    LLMResponse,
    LLMStructuredResult,
} from '../../types/llm-service.types.js';
import type { Part } from '@google/generative-ai';
import type { z } from 'zod';

export class CompositeLLMService implements ILLMService {
    constructor(
        private readonly primary: ITextLLMService & IRerankLLMService & IStructuredLLMService,
        private readonly document: IDocumentLLMService & IStructuredLLMService
    ) { }

    generate(systemPrompt: string, userContent: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
        return this.primary.generate(systemPrompt, userContent, options);
    }

    generateWithVision(systemPrompt: string, parts: Part[], options?: LLMGenerateOptions): Promise<LLMResponse> {
        return this.primary.generateWithVision(systemPrompt, parts, options);
    }

    generateSimple(prompt: string): Promise<string> {
        return this.primary.generateSimple(prompt);
    }

    generateForReranking(prompt: string): Promise<string> {
        return this.primary.generateForReranking(prompt);
    }

    uploadDocument(buffer: Buffer, filename: string): Promise<string> {
        return this.document.uploadDocument(buffer, filename);
    }

    generateWithDocument(documentUri: string, prompt: string, options?: LLMGenerateOptions): Promise<LLMResponse> {
        return this.document.generateWithDocument(documentUri, prompt, options);
    }

    generateStructured<T>(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        return this.primary.generateStructured(prompt, schema, options);
    }

    generateStructuredWithDocument<T>(
        documentUri: string,
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: z.ZodType<T, any, any>,
        options?: LLMGenerateOptions
    ): Promise<LLMStructuredResult<T>> {
        return this.document.generateStructuredWithDocument(documentUri, prompt, schema, options);
    }
}
