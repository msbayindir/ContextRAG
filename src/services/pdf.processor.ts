import * as fs from 'fs/promises';
import * as path from 'path';

import pdf from 'pdf-parse';
import { hashBuffer } from '../utils/hash.js';
import type { Logger } from '../utils/logger.js';
import type { 
    IPDFProcessor, 
    PDFMetadata, 
    PDFLoadResult, 
    BatchSpec 
} from '../types/pdf-processor.types.js';

// Re-export types for backward compatibility
export type { PDFMetadata, PDFLoadResult, BatchSpec };

/**
 * @deprecated Use PDFLoadResult from pdf-processor.types.ts instead
 */
export interface PageContent {
    pageNumber: number;
    text: string;
}

/**
 * @deprecated Use BatchSpec from pdf-processor.types.ts instead
 */
export interface PageBatch {
    batchIndex: number;
    pageStart: number;
    pageEnd: number;
    pages: PageContent[];
}

/**
 * PDF processing service
 * 
 * Implements IPDFProcessor interface for dependency injection.
 * 
 * @implements {IPDFProcessor}
 */
export class PDFProcessor implements IPDFProcessor {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Load PDF from file path or buffer
     * @implements IPDFProcessor.load
     */
    async load(input: Buffer | string): Promise<PDFLoadResult> {
        let buffer: Buffer;
        let filename: string;

        if (typeof input === 'string') {
            // File path
            buffer = await fs.readFile(input);
            filename = path.basename(input);
        } else {
            // Buffer
            buffer = input;
            filename = 'document.pdf';
        }

        const fileHash = hashBuffer(buffer);
        const fileSize = buffer.length;

        // Parse PDF to get page count
        const pdfData = await pdf(buffer);
        const pageCount = pdfData.numpages;

        this.logger.debug('PDF loaded', {
            filename,
            fileSize,
            pageCount,
        });

        return {
            buffer,
            metadata: {
                filename,
                fileHash,
                fileSize,
                pageCount,
                title: pdfData.info?.Title,
                author: pdfData.info?.Author,
            },
        };
    }





    /**
     * Split document into batches
     * @implements IPDFProcessor.createBatches
     */
    createBatches(pageCount: number, pagesPerBatch: number): BatchSpec[] {
        const batches: BatchSpec[] = [];

        for (let i = 0; i < pageCount; i += pagesPerBatch) {
            batches.push({
                batchIndex: batches.length,
                pageStart: i + 1, // 1-indexed
                pageEnd: Math.min(i + pagesPerBatch, pageCount),
            });
        }

        this.logger.debug('Created batches', {
            pageCount,
            pagesPerBatch,
            batchCount: batches.length,
        });

        return batches;
    }

    /**
     * Get page range description for prompts
     * @implements IPDFProcessor.getPageRangeDescription
     */
    getPageRangeDescription(pageStart: number, pageEnd: number): string {
        if (pageStart === pageEnd) {
            return `page ${pageStart}`;
        }
        return `pages ${pageStart}-${pageEnd}`;
    }
}
