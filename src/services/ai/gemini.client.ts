import { GoogleGenerativeAI, type GenerativeModel, type Content } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import type { ResolvedConfig } from '../../types/config.types.js';
import type { TokenUsage } from '../../types/chunk.types.js';
import { RateLimitError, GeminiAPIError, ContentPolicyError } from '../../errors/index.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import type { Logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GeminiResponse {
    text: string;
    tokenUsage: TokenUsage;
}

export class GeminiApiClient {
    private readonly genAI: GoogleGenerativeAI;
    private readonly fileManager: GoogleAIFileManager;
    private readonly model: GenerativeModel;

    constructor(
        private readonly config: ResolvedConfig,
        private readonly rateLimiter: RateLimiter,
        private readonly logger: Logger
    ) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.fileManager = new GoogleAIFileManager(config.geminiApiKey);
        this.model = this.genAI.getGenerativeModel({ model: config.model });
    }

    async generateContent(
        contents: Content[],
        options?: {
            temperature?: number;
            maxOutputTokens?: number;
            responseMimeType?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            responseSchema?: any;
        }
    ): Promise<GeminiResponse> {
        await this.rateLimiter.acquire();

        try {
            return await withRetry(async () => {
                const result = await this.model.generateContent({
                    contents,
                    generationConfig: {
                        temperature: options?.temperature ?? this.config.generationConfig.temperature,
                        maxOutputTokens: options?.maxOutputTokens ?? this.config.generationConfig.maxOutputTokens,
                        responseMimeType: options?.responseMimeType,
                        responseSchema: options?.responseSchema,
                    },
                });

                const response = result.response;
                const text = response.text();
                const usage = response.usageMetadata;

                this.rateLimiter.reportSuccess();

                return {
                    text,
                    tokenUsage: {
                        input: usage?.promptTokenCount ?? 0,
                        output: usage?.candidatesTokenCount ?? 0,
                        total: usage?.totalTokenCount ?? 0,
                    },
                };
            }, {
                maxRetries: 3,
                initialDelayMs: 1000,
                maxDelayMs: 10000,
                backoffMultiplier: 2,
                onRetry: (attempt, error) => {
                    this.logger.warn(`Gemini API retry attempt ${attempt}`, { error: error.message });
                }
            });
        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    async uploadPdfBuffer(buffer: Buffer, filename: string): Promise<string> {
        const tempPath = path.join(os.tmpdir(), `context-rag-${Date.now()}-${filename}`);

        try {
            fs.writeFileSync(tempPath, buffer);

            this.logger.info('Uploading PDF to Gemini Files API', { filename });

            const uploadResult = await this.fileManager.uploadFile(tempPath, {
                mimeType: 'application/pdf',
                displayName: filename,
            });

            this.logger.info('PDF uploaded successfully', {
                fileUri: uploadResult.file.uri,
                displayName: uploadResult.file.displayName,
            });

            return uploadResult.file.uri;
        } catch (error) {
            this.logger.error('Failed to upload PDF', { error: (error as Error).message });
            throw error;
        } finally {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }

    private handleError(error: Error): void {
        const message = error.message.toLowerCase();

        if (message.includes('429') || message.includes('rate limit')) {
            this.rateLimiter.reportRateLimitError();
            throw new RateLimitError('Gemini API rate limit exceeded');
        }

        if (message.includes('quota')) {
            throw new GeminiAPIError('API quota exceeded', {
                statusCode: 429,
                retryable: false,
            });
        }

        if (message.includes('safety') || message.includes('blocked')) {
            throw new ContentPolicyError('Content blocked by safety filters', {
                originalError: error.message,
            });
        }

        if (message.includes('timeout') || message.includes('network')) {
            throw new GeminiAPIError('Network error', {
                retryable: true,
            });
        }

        this.logger.error('Gemini API error', {
            error: error.message,
        });
    }
}
