/**
 * Chunk Parser Utility
 * 
 * Parse AI-generated content with SECTION markers into structured chunks.
 */

import { SECTION_PATTERN } from '../config/templates.js';
import { ChunkTypeEnum, type ChunkTypeEnumType } from '../types/enums.js';

/**
 * Parsed section from AI output
 */
export interface ParsedSection {
    /** Content type: TEXT, TABLE, LIST, etc. */
    type: ChunkTypeEnumType;
    /** Source page number */
    page: number;
    /** AI confidence score (0.0 - 1.0) */
    confidence: number;
    /** Raw content in Markdown format */
    content: string;
    /** Original index in the document */
    index: number;
}

/**
 * Parse AI output containing SECTION markers into structured sections
 * 
 * @param aiOutput - Raw AI output with <!-- SECTION --> markers
 * @returns Array of parsed sections
 * 
 * @example
 * ```typescript
 * const output = `
 * <!-- SECTION type="TEXT" page="1" confidence="0.95" -->
 * Some content here
 * <!-- /SECTION -->
 * `;
 * const sections = parseSections(output);
 * // [{ type: 'TEXT', page: 1, confidence: 0.95, content: 'Some content here', index: 0 }]
 * ```
 */
export function parseSections(aiOutput: string): ParsedSection[] {
    const sections: ParsedSection[] = [];

    // Reset regex state
    const regex = new RegExp(SECTION_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = regex.exec(aiOutput)) !== null) {
        const typeStr = (match[1] ?? 'TEXT').toUpperCase();
        const page = parseInt(match[2] ?? '1', 10);
        const confidence = parseFloat(match[3] ?? '0.5');
        const content = (match[4] ?? '').trim();

        // Validate and map type
        const type = mapToChunkType(typeStr);

        sections.push({
            type,
            page,
            confidence: isNaN(confidence) ? 0.5 : Math.min(1, Math.max(0, confidence)),
            content,
            index: index++,
        });
    }

    return sections;
}

/**
 * Map string type to ChunkTypeEnum
 */
function mapToChunkType(typeStr: string): ChunkTypeEnumType {
    const typeMap: Record<string, ChunkTypeEnumType> = {
        'TEXT': ChunkTypeEnum.TEXT,
        'TABLE': ChunkTypeEnum.TABLE,
        'LIST': ChunkTypeEnum.LIST,
        'CODE': ChunkTypeEnum.CODE,
        'HEADING': ChunkTypeEnum.HEADING,
        'QUOTE': ChunkTypeEnum.QUOTE,
        'IMAGE_REF': ChunkTypeEnum.IMAGE_REF,
        'QUESTION': ChunkTypeEnum.QUESTION,
        'MIXED': ChunkTypeEnum.MIXED,
    };

    return typeMap[typeStr] ?? ChunkTypeEnum.TEXT;
}

/**
 * Check if AI output contains valid SECTION markers
 * 
 * @param aiOutput - Raw AI output to check
 * @returns true if at least one valid SECTION found
 */
export function hasValidSections(aiOutput: string): boolean {
    const regex = new RegExp(SECTION_PATTERN.source);
    return regex.test(aiOutput);
}

/**
 * Fallback parser for content without SECTION markers
 * Splits content by double newlines and headers
 * 
 * @param content - Raw content without markers
 * @param pageStart - Starting page number
 * @param pageEnd - Ending page number
 * @returns Array of parsed sections with inferred types
 */
export function parseFallbackContent(
    content: string,
    pageStart: number,
    _pageEnd: number
): ParsedSection[] {
    const sections: ParsedSection[] = [];

    // Split by double newlines or headers
    const parts = content.split(/\n(?=#{1,6}\s)|(?:\n\n)/);

    let index = 0;
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed.length < 10) continue;

        sections.push({
            type: detectContentType(trimmed),
            page: pageStart,
            confidence: 0.6, // Lower confidence for fallback
            content: trimmed,
            index: index++,
        });
    }

    return sections;
}

/**
 * Detect content type from text patterns
 */
function detectContentType(content: string): ChunkTypeEnumType {
    // Table detection: has | and ---
    if (content.includes('|') && content.includes('---')) {
        return ChunkTypeEnum.TABLE;
    }

    // List detection: starts with - or number
    if (/^[-*]\s/m.test(content) || /^\d+\.\s/m.test(content)) {
        return ChunkTypeEnum.LIST;
    }

    // Code detection: starts with ```
    if (content.includes('```')) {
        return ChunkTypeEnum.CODE;
    }

    // Heading detection: starts with #
    if (/^#{1,6}\s/.test(content)) {
        return ChunkTypeEnum.HEADING;
    }

    // Quote detection: starts with >
    if (content.startsWith('>')) {
        return ChunkTypeEnum.QUOTE;
    }

    // Image reference detection
    if (content.includes('[IMAGE:')) {
        return ChunkTypeEnum.IMAGE_REF;
    }

    // Question detection: A) B) C) D) or A. B. C. D. pattern
    if (/[A-E][).]\s/m.test(content) && /[B-E][).]\s/m.test(content)) {
        return ChunkTypeEnum.QUESTION;
    }

    return ChunkTypeEnum.TEXT;
}

/**
 * Clean content for search (remove Markdown formatting)
 * 
 * @param content - Markdown formatted content
 * @returns Plain text suitable for vector search
 */
export function cleanForSearch(content: string): string {
    return content
        .replace(/#{1,6}\s/g, '') // Remove heading markers
        .replace(/\*\*/g, '') // Remove bold
        .replace(/\*/g, '') // Remove italic
        .replace(/`/g, '') // Remove code markers
        .replace(/\|/g, ' ') // Replace table pipes with spaces
        .replace(/---+/g, '') // Remove horizontal rules
        .replace(/\[IMAGE:[^\]]*\]/g, '') // Remove image refs
        .replace(/<!--.*?-->/gs, '') // Remove HTML comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

/**
 * Extract search and display content from a section
 */
export interface ProcessedChunk {
    searchContent: string;
    displayContent: string;
    type: ChunkTypeEnumType;
    page: number;
    confidence: number;
}

/**
 * Process a parsed section into search and display formats
 */
export function processSection(section: ParsedSection): ProcessedChunk {
    return {
        searchContent: cleanForSearch(section.content),
        displayContent: section.content,
        type: section.type,
        page: section.page,
        confidence: section.confidence,
    };
}
