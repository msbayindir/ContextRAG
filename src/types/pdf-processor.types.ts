/**
 * PDF document metadata extracted during loading
 */
export interface PDFMetadata {
    /** Original filename */
    filename: string;
    /** SHA-256 hash of file content */
    fileHash: string;
    /** File size in bytes */
    fileSize: number;
    /** Total number of pages */
    pageCount: number;
    /** Document title from PDF metadata */
    title?: string;
    /** Document author from PDF metadata */
    author?: string;
}

/**
 * Batch specification for page processing
 */
export interface BatchSpec {
    /** Zero-based batch index */
    batchIndex: number;
    /** First page number (1-indexed) */
    pageStart: number;
    /** Last page number (1-indexed, inclusive) */
    pageEnd: number;
}

/**
 * Result of loading a PDF document
 */
export interface PDFLoadResult {
    /** PDF file buffer */
    buffer: Buffer;
    /** Extracted metadata */
    metadata: PDFMetadata;
}

/**
 * PDF Processor Interface
 * 
 * Abstraction over PDF processing libraries (pdf-parse, pdf-lib, etc.)
 * Allows swapping PDF processors without changing consumer code.
 * 
 * @example
 * ```typescript
 * class IngestionEngine {
 *   constructor(private pdfProcessor: IPDFProcessor) {}
 *   
 *   async ingest(file: Buffer) {
 *     const { buffer, metadata } = await this.pdfProcessor.load(file);
 *     const batches = this.pdfProcessor.createBatches(metadata.pageCount, 5);
 *     // Process batches...
 *   }
 * }
 * ```
 */
export interface IPDFProcessor {
    /**
     * Load PDF from file path or buffer
     * Extracts metadata including page count, title, author
     * @param input - File path string or PDF buffer
     * @returns PDF buffer and extracted metadata
     */
    load(input: Buffer | string): Promise<PDFLoadResult>;

    /**
     * Create batch specifications for page processing
     * Splits document into batches of specified size
     * @param pageCount - Total number of pages
     * @param pagesPerBatch - Pages to include in each batch
     * @returns Array of batch specifications
     */
    createBatches(pageCount: number, pagesPerBatch: number): BatchSpec[];

    /**
     * Get human-readable page range description
     * @param pageStart - Start page number
     * @param pageEnd - End page number
     * @returns Formatted string like "page 1" or "pages 1-5"
     */
    getPageRangeDescription(pageStart: number, pageEnd: number): string;
}
