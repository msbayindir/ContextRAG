import * as fs from 'fs/promises';
import * as path from 'path';
import type { Part } from '@google/generative-ai';
import pdf from 'pdf-parse';
import { hashBuffer } from '../utils/hash.js';
import type { Logger } from '../utils/logger.js';

/**
 * PDF document metadata
 */
export interface PDFMetadata {
    filename: string;
    fileHash: string;
    fileSize: number;
    pageCount: number;
    title?: string;
    author?: string;
}

/**
 * Page content extract
 */
export interface PageContent {
    pageNumber: number;
    text: string;
}

/**
 * Batch of pages for processing
 */
export interface PageBatch {
    batchIndex: number;
    pageStart: number;
    pageEnd: number;
    pages: PageContent[];
}

/**
 * PDF processing service
 */
export class PDFProcessor {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Load PDF from file path or buffer
     */
    async load(input: Buffer | string): Promise<{
        buffer: Buffer;
        metadata: PDFMetadata;
    }> {
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
     * Extract text from all pages
     */
    async extractText(buffer: Buffer): Promise<PageContent[]> {
        const pdfData = await pdf(buffer);

        // pdf-parse returns all text combined, we need to split by pages
        // This is a limitation - for actual page splitting, we'd need pdf.js
        // For now, return as single page
        return [{
            pageNumber: 1,
            text: pdfData.text,
        }];
    }

    /**
     * Convert PDF buffer to base64 for Gemini Vision API
     */
    toBase64(buffer: Buffer): string {
        return buffer.toString('base64');
    }

    /**
     * Create Gemini vision part from PDF
     */
    createVisionPart(buffer: Buffer): Part {
        return {
            inlineData: {
                mimeType: 'application/pdf',
                data: this.toBase64(buffer),
            },
        };
    }

    /**
     * Split document into batches
     */
    createBatches(pageCount: number, pagesPerBatch: number): Array<{
        batchIndex: number;
        pageStart: number;
        pageEnd: number;
    }> {
        const batches: Array<{
            batchIndex: number;
            pageStart: number;
            pageEnd: number;
        }> = [];

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
     */
    getPageRangeDescription(pageStart: number, pageEnd: number): string {
        if (pageStart === pageEnd) {
            return `page ${pageStart}`;
        }
        return `pages ${pageStart}-${pageEnd}`;
    }
}
