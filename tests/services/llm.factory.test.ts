import { describe, it, expect } from 'vitest';
import { createLLMService } from '../../src/services/llm/llm.factory.js';
import { CompositeLLMService } from '../../src/services/llm/composite.service.js';
import { ConfigurationError } from '../../src/errors/index.js';
import { createMockResolvedConfig } from '../mocks/fixtures.js';

describe('LLM service factory', () => {
    it('creates a composite service when providers differ', () => {
        const config = createMockResolvedConfig({
            llmProvider: { provider: 'openai', apiKey: 'test-openai-key' },
            documentProvider: { provider: 'gemini', apiKey: 'test-gemini-key' },
        });

        const service = createLLMService(config);
        expect(service).toBeInstanceOf(CompositeLLMService);
    });

    it('throws when document provider lacks document support', () => {
        const config = createMockResolvedConfig({
            llmProvider: { provider: 'openai', apiKey: 'test-openai-key' },
            documentProvider: { provider: 'openai', apiKey: 'test-openai-key' },
        });

        expect(() => createLLMService(config)).toThrow(ConfigurationError);
    });
});
