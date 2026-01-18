/**
 * Context-RAG Template Configuration
 * 
 * This file contains all prompt templates used for document processing.
 * Templates use {{PLACEHOLDER}} syntax for dynamic content injection.
 */

// ============================================
// DISCOVERY TEMPLATE
// ============================================

/**
 * Template for document analysis and strategy discovery.
 * AI returns structured JSON with document-specific instructions.
 */
export const DISCOVERY_TEMPLATE = `You are a document analysis AI. Analyze the provided document and determine the optimal processing strategy.

Analyze the document and return ONLY a JSON response with the following structure:

{
  "documentType": "Medical|Legal|Financial|Technical|Academic|General",
  "documentTypeName": "Human readable name for this document type",
  "language": "tr|en|de|fr|...",
  "complexity": "low|medium|high",
  
  "detectedElements": [
    { "type": "table", "count": 5, "description": "Brief description of tables" },
    { "type": "list", "count": 10, "description": "Brief description of lists" },
    { "type": "code", "count": 0, "description": "" },
    { "type": "image", "count": 3, "description": "Brief description of images" }
  ],
  
  "specialInstructions": [
    "Specific instruction 1 for this document type",
    "Specific instruction 2 for this document type",
    "Specific instruction 3 for this document type"
  ],
  
  "exampleFormats": [
    { "element": "table", "format": "Markdown table with headers" },
    { "element": "code", "format": "Code block with language tag" }
  ],
  
  "chunkStrategy": {
    "maxTokens": 800,
    "overlapTokens": 100,
    "splitBy": "section|page|paragraph|semantic",
    "preserveTables": true,
    "preserveLists": true
  },
  
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this strategy was chosen"
}

IMPORTANT RULES:
1. DO NOT generate a full extraction prompt
2. Only provide structured analysis and specific instructions
3. Instructions should be actionable and specific to this document type
4. Example formats help maintain consistency in extraction

{{DOCUMENT_TYPE_HINT}}
`;

// ============================================
// BASE EXTRACTION TEMPLATE
// ============================================

/**
 * Base template for content extraction.
 * Document-specific instructions are injected via {{DOCUMENT_INSTRUCTIONS}}.
 */
export const BASE_EXTRACTION_TEMPLATE = `You are a document processing AI. Extract content following the EXACT format below.

## OUTPUT FORMAT (MANDATORY - DO NOT MODIFY)

⚠️ CRITICAL: You MUST use EXACTLY this marker format. Any deviation will cause parsing errors:

\`\`\`
<!-- SECTION type="[TYPE]" page="[PAGE]" confidence="[0.0-1.0]" -->
[Content here in Markdown format]
<!-- /SECTION -->
\`\`\`

### EXAMPLE OUTPUT (FOLLOW THIS EXACTLY):
\`\`\`
<!-- SECTION type="HEADING" page="1" confidence="0.95" -->
# Introduction to Metabolism
<!-- /SECTION -->

<!-- SECTION type="TEXT" page="1" confidence="0.92" -->
Metabolism refers to all chemical reactions in an organism...
<!-- /SECTION -->

<!-- SECTION type="LIST" page="2" confidence="0.90" -->
- First item in the list
- Second item in the list
- Third item in the list
<!-- /SECTION -->

<!-- SECTION type="TABLE" page="2" confidence="0.88" -->
| Column1 | Column2 |
|---------|---------|
| Data1   | Data2   |
<!-- /SECTION -->
\`\`\`

### Valid Types:
- TEXT: Regular paragraphs and prose
- TABLE: Data tables in Markdown format
- LIST: Bullet (-) or numbered (1. 2. 3.) lists
- HEADING: Section headers with # ## ### levels
- CODE: Code blocks with language specification
- QUOTE: Quoted text or citations
- IMAGE_REF: Description of images, charts, figures
- QUESTION: Multiple choice questions with options (A, B, C, D, E)

### Format Rules:
1. **Tables**: Use Markdown table format
   | Column1 | Column2 | Column3 |
   |---------|---------|---------|
   | data    | data    | data    |

2. **Lists**: Use consistent format
   - Bullet item
   - Another bullet
   
   OR
   
   1. Numbered item
   2. Another numbered

3. **Headings**: Maximum 3 levels, use hierarchy
   # Main Section
   ## Subsection
   ### Sub-subsection

4. **Code**: Specify language
   \`\`\`python
   code here
   \`\`\`

5. **Images**: Describe visual content
   [IMAGE: Description of what the image shows]

6. **Questions**: Multiple choice questions with options
   **Question 1:** Question text here?
   A) Option A text
   B) Option B text
   C) Option C text
   D) Option D text
   E) Option E text (if exists)
   **Answer:** [Letter] (if answer is provided in document)

## DOCUMENT-SPECIFIC INSTRUCTIONS
{{DOCUMENT_INSTRUCTIONS}}

## CRITICAL EXTRACTION RULES (DO NOT VIOLATE)
⚠️ These rules are MANDATORY for legal, medical, and financial document accuracy:

1. **NO SUMMARIZATION**: Extract content EXACTLY as written. Do not summarize, paraphrase, or condense.
2. **NO INTERPRETATION**: Do not interpret, explain, or add commentary to the content.
3. **PRESERVE ORIGINAL WORDING**: Keep exact terminology, especially for:
   - Legal terms, clauses, and article references
   - Medical terminology, diagnoses, and prescriptions
   - Financial figures, percentages, and calculations
   - Technical specifications and measurements
4. **VERBATIM EXTRACTION**: Copy text word-for-word from the document.
5. **NO OMISSIONS**: Include all content, even if it seems redundant or repetitive.
6. **UNCLEAR CONTENT**: If text is unclear or illegible, extract as-is and mark: [UNCLEAR: partial text visible]
7. **FOREIGN TERMS**: Keep foreign language terms, Latin phrases, and abbreviations exactly as written.

## PROCESSING RULES
- Extract ALL content completely, do not summarize or skip
- Preserve original document structure and hierarchy
- Include page references for each section
- Maintain technical accuracy and terminology
- Use appropriate confidence scores based on extraction quality
- If content spans multiple pages, use the starting page number

## PAGE RANGE
{{PAGE_RANGE}}
`;

// ============================================
// STRUCTURED EXTRACTION TEMPLATE
// ============================================

/**
 * Template for structured content extraction via JSON Schema.
 * Focuses on accuracy and following instructions, without legacy marker noise.
 */
export const STRUCTURED_EXTRACTION_TEMPLATE = `You are a document processing AI. Extract content from the provided document pages.

Your goal is to extract content accurately, preserving the logical structure and semantics.

## INSTRUCTIONS
{{DOCUMENT_INSTRUCTIONS}}

## PAGE RANGE
{{PAGE_RANGE}}

IMPORTANT:
1. Extract content strictly from the specified page range.
2. Maintain the order of elements as they appear in the document.
3. Don't summarize code blocks or tables; extract them fully.
4. Follow the specific document instructions provided above.
`;

// ============================================
// DEFAULT DOCUMENT INSTRUCTIONS
// ============================================

/**
 * Default instructions when no Discovery result is available
 */
export const DEFAULT_DOCUMENT_INSTRUCTIONS = `
- Extract all text content preserving structure
- Convert tables to Markdown table format
- Convert lists to Markdown list format
- Preserve headings with appropriate # levels
- Note any images with descriptive text
- Maintain the logical flow of content
`;

// ============================================
// TEMPLATE BUILDER FUNCTIONS
// ============================================

/**
 * Build extraction prompt from discovery result
 */
export function buildExtractionPrompt(
  documentInstructions: string[],
  exampleFormats?: Array<{ element: string; format: string }> | Record<string, string>,
  pageStart?: number,
  pageEnd?: number,
  useStructuredOutput: boolean = false
): string {
  // Build instructions section
  let instructionsBlock = documentInstructions
    .map(instruction => `- ${instruction}`)
    .join('\n');

  // Add example formats if provided
  // Normalize example formats to array
  let formats: Array<{ element: string; format: string }> = [];
  if (Array.isArray(exampleFormats)) {
    formats = exampleFormats;
  } else if (exampleFormats) {
    formats = Object.entries(exampleFormats).map(([key, value]) => ({
      element: key,
      format: value
    }));
  }

  // Add example formats if provided
  if (formats.length > 0) {
    instructionsBlock += '\n\n### Example Formats:\n';
    for (const example of formats) {
      instructionsBlock += `- **${example.element}**: \`${example.format}\`\n`;
    }
  }

  // Build page range description
  let pageRange = '';
  if (pageStart !== undefined && pageEnd !== undefined) {
    if (pageStart === pageEnd) {
      pageRange = `Process page ${pageStart} of this document.`;
    } else {
      pageRange = `Process pages ${pageStart}-${pageEnd} of this document.`;
    }
  }

  const template = useStructuredOutput ? STRUCTURED_EXTRACTION_TEMPLATE : BASE_EXTRACTION_TEMPLATE;

  return template
    .replace('{{DOCUMENT_INSTRUCTIONS}}', instructionsBlock || DEFAULT_DOCUMENT_INSTRUCTIONS)
    .replace('{{PAGE_RANGE}}', pageRange);
}

/**
 * Build discovery prompt with optional type hint
 */
export function buildDiscoveryPrompt(documentTypeHint?: string): string {
  let hint = '';
  if (documentTypeHint) {
    hint = `\nHint: The user expects this to be a "${documentTypeHint}" document. Consider this when analyzing.`;
  }

  return DISCOVERY_TEMPLATE.replace('{{DOCUMENT_TYPE_HINT}}', hint);
}

// ============================================
// SECTION REGEX PATTERNS
// ============================================

/**
 * Regex pattern to match SECTION blocks in AI output
 * Supports both formats:
 * - <!-- SECTION type="TEXT" page="1" confidence="0.9" --> (preferred)
 * - <!-- SECTION TEXT page="1" confidence="0.9" --> (legacy/fallback)
 */
export const SECTION_PATTERN = /<!-- SECTION (?:type=")?(\w+)"? page="(\d+)" confidence="([\d.]+)" -->\n?([\s\S]*?)\n?<!-- \/SECTION -->/g;

/**
 * Regex pattern for single SECTION match
 */
export const SECTION_PATTERN_SINGLE = /<!-- SECTION (?:type=")?(\w+)"? page="(\d+)" confidence="([\d.]+)" -->\n?([\s\S]*?)\n?<!-- \/SECTION -->/;
