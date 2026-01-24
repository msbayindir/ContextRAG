import type { ResolvedConfig, LLMProviderConfig } from '../../types/config.types.js';
import type { ILLMService, ILLMServiceFactory } from '../../types/llm-service.types.js';
import { ConfigurationError } from '../../errors/index.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import { createLogger } from '../../utils/index.js';
import type { Logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { GeminiService } from '../gemini.service.js';
import { OpenAILLMService } from './openai.service.js';
import { AnthropicLLMService } from './anthropic.service.js';
import { CompositeLLMService } from './composite.service.js';

type ProviderId = LLMProviderConfig['provider'];

const DEFAULT_MODELS: Record<ProviderId, string> = {
    gemini: 'gemini-1.5-pro',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20240620',
};

export function createLLMService(
    config: ResolvedConfig,
    logger?: Logger
): ILLMService {
    const primaryConfig = normalizeProviderConfig(config, config.llmProvider);
    const documentConfig = normalizeProviderConfig(config, config.documentProvider);

    if (!isDocumentCapable(documentConfig.provider)) {
        throw new ConfigurationError(
            'Selected document provider does not support document operations. Use gemini or configure documentProvider.',
            { provider: documentConfig.provider }
        );
    }

    const useComposite = primaryConfig.provider !== documentConfig.provider
        || primaryConfig.model !== documentConfig.model
        || primaryConfig.apiKey !== documentConfig.apiKey;

    if (useComposite) {
        const primary = createProviderService(primaryConfig, config, logger);
        const document = createProviderService(documentConfig, config, logger);
        return new CompositeLLMService(primary, document);
    }

    return createProviderService(primaryConfig, config, logger);
}

export function createLLMServiceFactory(): ILLMServiceFactory {
    return {
        create: (resolvedConfig: ResolvedConfig) =>
            createLLMService(resolvedConfig),
    };
}

function createProviderService(
    providerConfig: LLMProviderConfig,
    resolvedConfig: ResolvedConfig,
    logger?: Logger
): ILLMService {
    const serviceLogger = logger ?? createLogger(resolvedConfig.logging);
    const rateLimiter = new RateLimiter(resolvedConfig.rateLimitConfig);

    switch (providerConfig.provider) {
        case 'gemini':
            return new GeminiService(
                resolvedConfig,
                rateLimiter,
                serviceLogger
            );

        case 'openai':
            return new OpenAILLMService(
                {
                    apiKey: providerConfig.apiKey!,
                    model: providerConfig.model,
                },
                rateLimiter,
                serviceLogger
            );

        case 'anthropic':
            return new AnthropicLLMService(
                {
                    apiKey: providerConfig.apiKey!,
                    model: providerConfig.model,
                },
                rateLimiter,
                serviceLogger
            );

        default:
            throw new ConfigurationError(`Unknown LLM provider: ${providerConfig.provider}`, {
                provider: providerConfig.provider,
            });
    }
}

function normalizeProviderConfig(
    resolvedConfig: ResolvedConfig,
    input: LLMProviderConfig
): LLMProviderConfig {
    const provider = input.provider;

    if (provider === 'gemini') {
        return {
            provider,
            apiKey: input.apiKey ?? resolvedConfig.geminiApiKey,
            model: input.model ?? resolvedConfig.model ?? DEFAULT_MODELS.gemini,
        };
    }

    if (provider === 'openai') {
        const apiKey = input.apiKey ?? env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new ConfigurationError('OpenAI API key is required', { provider: 'openai' });
        }
        return {
            provider,
            apiKey,
            model: input.model ?? DEFAULT_MODELS.openai,
        };
    }

    if (provider === 'anthropic') {
        const apiKey = input.apiKey ?? env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new ConfigurationError('Anthropic API key is required', { provider: 'anthropic' });
        }
        return {
            provider,
            apiKey,
            model: input.model ?? DEFAULT_MODELS.anthropic,
        };
    }

    throw new ConfigurationError(`Unknown LLM provider: ${provider}`, { provider });
}

function isDocumentCapable(provider: ProviderId): boolean {
    return provider === 'gemini';
}
