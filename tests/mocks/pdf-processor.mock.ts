/**
 * Mock PDF Processor
 * 
 * Provides type-safe mocks for IPDFProcessor interface.
 * Returns sensible defaults that can be overridden per test.
 */

import { vi } from 'vitest';
import type { IPDFProcessor, PDFLoadResult, PDFBatch } from '../../src/types/pdf-processor.types.js';

/**
 * Default mock PDF metadata
 */
export const DEFAULT_PDF_METADATA = {
    pageCount: 10,
    filename: 'test-document.pdf',
    sizeBytes: 1024 * 1024, // 1MB
};

/**
 * Mock IPDFProcessor type
 */
export type MockPDFProcessor = {
    [K in keyof IPDFProcessor]: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock IPDFProcessor implementation
 * 
 * Follows the IPDFProcessor interface for v2.0 dependency injection.
 * Suitable for testing engines and services that depend on IPDFProcessor.
 * 
 * @example
 * ```typescript
 * const mockPDF = createMockPDFProcessor();
 * const engine = new DiscoveryEngine(config, llm, mockPDF, logger);
 * 
 * // Customize behavior
 * mockPDF.load.mockResolvedValue({
 *   buffer: customBuffer,
 *   metadata: { pageCount: 50, filename: 'large.pdf', sizeBytes: 5000000 },
 * });
 * ```
 */
export function createMockPDFProcessor(): MockPDFProcessor {
    return {
        load: vi.fn().mockResolvedValue({
            buffer: Buffer.from('mock-pdf-content'),
            metadata: { ...DEFAULT_PDF_METADATA },
        } as PDFLoadResult),

        createBatches: vi.fn().mockImplementation((buffer: Buffer, pageCount: number, pagesPerBatch: number) => {
            const batchCount = Math.ceil(pageCount / pagesPerBatch);
            const batches: PDFBatch[] = [];

            for (let i = 0; i < batchCount; i++) {
                const startPage = i * pagesPerBatch + 1;
                const endPage = Math.min((i + 1) * pagesPerBatch, pageCount);
                batches.push({
                    index: i,
                    startPage,
                    endPage,
                    pageCount: endPage - startPage + 1,
                    buffer: Buffer.from(`batch-${i}-content`),
                });
            }

            return Promise.resolve(batches);
        }),

        getPageRangeDescription: vi.fn().mockImplementation((startPage: number, endPage: number) => {
            if (startPage === endPage) {
                return `Page ${startPage}`;
            }
            return `Pages ${startPage}-${endPage}`;
        }),
    };
}

/**
 * Create a mock that returns a specific page count
 */
export function createMockPDFProcessorWithPages(pageCount: number): MockPDFProcessor {
    const mock = createMockPDFProcessor();

    mock.load.mockResolvedValue({
        buffer: Buffer.from('mock-pdf-content'),
        metadata: { ...DEFAULT_PDF_METADATA, pageCount },
    } as PDFLoadResult);

    return mock;
}

/**
 * Create a mock that fails on load
 */
export function createMockPDFProcessorWithError(errorMessage: string): MockPDFProcessor {
    const mock = createMockPDFProcessor();

    mock.load.mockRejectedValue(new Error(errorMessage));

    return mock;
}
