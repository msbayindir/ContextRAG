# 🧠 Context-RAG

> **Context-RAG is not another RAG wrapper.**  
> It's a document-understanding engine designed for real-world knowledge systems.

[![npm version](https://img.shields.io/npm/v/@msbayindir/context-rag.svg)](https://www.npmjs.com/package/@msbayindir/context-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)]()

> ⚠️ **Status: Beta** — Actively used in production (medical RAG & enterprise docs), API stable, breaking changes documented.

---

## ⚡ 60-Second Quick Start

```typescript
import { ContextRAG } from '@msbayindir/context-rag';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const rag = new ContextRAG({
  prisma: new PrismaClient(),
  geminiApiKey: process.env.GEMINI_API_KEY!,
});

// Ingest a PDF
await rag.ingest({
  file: fs.readFileSync('./document.pdf'),
  filename: 'document.pdf',
});

// Search with context
const results = await rag.search({
  query: 'What are the key findings?',
  mode: 'hybrid',
  useReranking: true,
});

console.log(results[0].chunk.displayContent);
```

> 📌 **Requires:** PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) extension

---

## 🎯 Who is this for?

| You should use Context-RAG if you... |
|--------------------------------------|
| 🏗️ Are building **production RAG systems** (not prototypes) |
| 📄 Process **large PDFs** — medical, legal, enterprise docs |
| 🐘 Want **PostgreSQL-only** stack (no Pinecone, no Weaviate, no vendor lock-in) |
| 😤 Are frustrated with **context loss** in traditional chunking |
| 🔬 Need **experiment tracking** to compare different extraction strategies |

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🚀 **Gemini Files API** | Upload PDF once, use cached URI for entire pipeline (90%+ bandwidth savings) |
| 🧠 **Contextual Retrieval** | Anthropic-style context generation for each chunk (improves recall by ~49%) |
| 🎯 **Reranking** | Gemini or Cohere-powered relevance reranking (reduces retrieval failure by ~67%) |
| 🔍 **Discovery Agent** | AI automatically analyzes documents and suggests optimal chunking strategies |
| 📄 **Multimodal Processing** | Uses Gemini Vision API to understand tables, charts, and layouts |
| 🧪 **Experiment System** | A/B test different models on same document for comparison |
| 🔎 **Hybrid Search** | Semantic (vector) + Keyword (full-text) search combination |
| 🐘 **PostgreSQL Native** | No external vector DB needed, uses pgvector |
| ⚡ **Batch Processing** | Concurrent processing with automatic retry |
| 🛡️ **Enterprise Error Handling** | Correlation IDs, graceful degradation, structured logging |

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Input
        PDF[📄 PDF Document]
    end

    subgraph Discovery["🔍 Discovery Phase"]
        DA[Discovery Agent]
        DA --> |Analyzes| PS[Prompt Strategy]
        DA --> |Suggests| CS[Chunk Types]
    end

    subgraph Ingestion["📥 Ingestion Pipeline"]
        GF[Gemini Files API]
        BP[Batch Processor]
        SE[Structured Extraction]
        CR[Contextual Retrieval]
        VE[Vector Embedding]
    end

    subgraph Storage["🗄️ PostgreSQL"]
        PG[(pgvector)]
        FT[Full-Text Index]
    end

    subgraph Retrieval["🔎 Search & Retrieval"]
        HS[Hybrid Search]
        RR[Reranker]
        RR --> |Gemini or Cohere| RS[Ranked Results]
    end

    PDF --> DA
    PS --> GF
    GF --> |Cached URI| BP
    BP --> SE
    SE --> CR
    CR --> |"Adds Context"| VE
    VE --> PG
    VE --> FT
    
    Query[🔍 Query] --> HS
    HS --> PG
    HS --> FT
    PG & FT --> RR
    RS --> Response[📋 Contextual Results]
```

---

## 🤔 Why Contextual Retrieval?

> **Problem:** Traditional RAG systems lose context when chunking documents. A chunk saying *"The inhibitor blocks Complex IV"* is meaningless without knowing it's from the *"Electron Transport Chain"* section.

### The Anthropic Research

[Anthropic's Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) paper showed that adding context to each chunk dramatically improves retrieval quality:

| Method | Retrieval Failure Rate | Improvement |
|--------|------------------------|-------------|
| Traditional RAG | 5.7% | - |
| + BM25 Hybrid | 4.5% | +21% |
| + Contextual Retrieval | 2.9% | **+49%** |
| + Contextual + Reranking | 1.9% | **+67%** |

### How Context-RAG Implements This

```typescript
// Before: Raw chunk (loses context)
{
  content: "The inhibitor blocks Complex IV",
  // Where is this from? What document? What section?
}

// After: Contextual chunk (Context-RAG)
{
  content: "The inhibitor blocks Complex IV",
  contextText: "This chunk is from 'Biochemistry 101', Chapter 5: Electron Transport Chain. It describes how cyanide inhibits cytochrome c oxidase (Complex IV), stopping ATP synthesis.",
  enrichedContent: "[CONTEXT] ... [CONTENT] The inhibitor blocks Complex IV"
}
```

---

## 📋 Real-World Use Cases

### 🏥 1. Medical Education (TUS/USMLE Prep)

**Scenario:** Turkish medical students preparing for TUS exam with 500+ page biochemistry PDFs.

```typescript
const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
  ragEnhancement: {
    approach: 'anthropic_contextual',  // Enable contextual retrieval
    strategy: 'llm',
    model: 'gemini-2.5-flash',
  },
});

// Discovery: AI analyzes the PDF and suggests extraction strategy
const discovery = await rag.discover({ file: pdfBuffer, filename: 'biochemistry.pdf' });

// Ingest with discovered strategy
await rag.ingest({
  file: pdfBuffer,
  filename: 'biochemistry.pdf',
  promptConfig: discovery.promptConfig,  // AI-suggested prompts
});

// Students can now ask contextual questions
const results = await rag.search({
  query: 'Siyanür hangi kompleksi inhibe eder?',
  mode: 'hybrid',
  useReranking: true,
});
// Returns: "Complex IV (Cytochrome c oxidase)" with full chapter context
```

### ⚖️ 2. Legal Document Analysis

**Scenario:** Law firms processing contracts, regulations, and case law.

```typescript
// Custom extraction for legal documents
await rag.ingest({
  file: contractPdf,
  filename: 'service-agreement.pdf',
  customPrompt: `
    Extract the following from this legal document:
    - CLAUSE: Individual contract clauses with section numbers
    - DEFINITION: Defined terms and their meanings  
    - OBLIGATION: Parties' obligations and deadlines
    - LIABILITY: Liability limitations and indemnifications
  `,
});

// Search with type filtering
const liabilityClauses = await rag.search({
  query: 'limitation of liability for indirect damages',
  filters: { chunkTypes: ['LIABILITY', 'CLAUSE'] },
  useReranking: true,
});
```

### 🏢 3. Enterprise Knowledge Base

**Scenario:** Company onboarding with internal policies, procedures, and technical docs.

```typescript
// Process multiple document types
for (const doc of ['hr-policy.pdf', 'security-guidelines.pdf', 'api-docs.pdf']) {
  const discovery = await rag.discover({ file: docs[doc], filename: doc });
  await rag.ingest({
    file: docs[doc],
    filename: doc,
    promptConfig: discovery.promptConfig,
    experimentId: 'knowledge-base-v1',  // Group related documents
  });
}

// Employees search across all documents
const results = await rag.search({
  query: 'What is the vacation policy for remote employees?',
  mode: 'hybrid',
});
```

---

## 🛡️ Enterprise Error Handling

Context-RAG implements production-grade error handling with full traceability:

### Correlation IDs

Every operation is tracked with a unique correlation ID for debugging:

```typescript
import { generateCorrelationId, setCorrelationId } from '@msbayindir/context-rag';

// Set correlation ID for request tracing
const correlationId = generateCorrelationId();  // crag_1737470109_abc123
setCorrelationId(correlationId);

// All logs and errors now include this ID
// [2026-01-21T18:00:00.000Z] [INFO] Starting ingestion {"correlationId":"crag_1737470109_abc123"}
```

### Custom Error Classes

```typescript
import { 
  IngestionError, 
  RerankingError, 
  ConfigurationError,
  RateLimitError 
} from '@msbayindir/context-rag';

try {
  await rag.ingest({ file: pdfBuffer, filename: 'doc.pdf' });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfterMs}ms`);
    console.log(`Correlation ID: ${error.correlationId}`);
  } else if (error instanceof IngestionError) {
    console.log(`Ingestion failed at batch ${error.batchIndex}`);
    console.log(`Retryable: ${error.retryable}`);
  }
}
```

### Health Check

```typescript
const health = await rag.healthCheck();
// {
//   status: 'healthy',
//   database: true,
//   pgvector: true,
//   reranking: { enabled: true, provider: 'gemini', configured: true }
// }
```

---

## 📦 Installation

```bash
npm install @msbayindir/context-rag
# or
pnpm add @msbayindir/context-rag
# or
yarn add @msbayindir/context-rag
```

---

## 🖥️ CLI Commands

```bash
# Initialize Context-RAG in your project (adds Prisma models to your schema)
npx @msbayindir/context-rag init

# Force overwrite existing models
npx @msbayindir/context-rag init --force

# Check setup status (Prisma models, pgvector, env variables)
npx @msbayindir/context-rag status

# Check for embedding model mismatches
npx @msbayindir/context-rag check-embeddings

# Re-index documents (useful after changing embedding models)
npx @msbayindir/context-rag reindex --concurrency 5
```

---

## 🛠️ Prerequisites

### 1. PostgreSQL with pgvector Extension

```bash
# Ubuntu/Debian
sudo apt install postgresql-15-pgvector

# macOS (Homebrew)
brew install pgvector

# Docker
docker run -e POSTGRES_PASSWORD=password -p 5432:5432 pgvector/pgvector:pg15
```

Then enable the extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Prisma Schema Setup

Context-RAG requires 4 models in your Prisma schema. Use our CLI to auto-add them:

```bash
# Automatically adds Context-RAG models to your schema
npx @msbayindir/context-rag init

# Then run migrations
npx prisma migrate dev --name add-context-rag
```

<details>
<summary>📋 Manual Setup (click to expand)</summary>

```prisma
// Required: pgvector extension
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

// 4 models: ContextRagPromptConfig, ContextRagChunk, ContextRagDocument, ContextRagBatch
// Full schema: https://github.com/msbayindir/ContextRAG/blob/main/prisma/schema.prisma
```

</details>


### 3. Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
GEMINI_API_KEY="your-gemini-api-key"

# Optional: Cohere API key for better reranking (free tier: 10K/month)
COHERE_API_KEY="your-cohere-api-key"
```

---

## 🧩 Usage (Full Example)

```typescript
import { ContextRAG } from '@msbayindir/context-rag';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
  model: 'gemini-3-flash-preview',
  
  // NEW: Contextual Retrieval Enhancement
  ragEnhancement: {
    approach: 'anthropic_contextual',
    strategy: 'simple', // 'none' | 'simple' | 'llm'
  },
});

// 🔍 Discover optimal strategy
const strategy = await rag.discover({ file: './document.pdf' });
console.log(`Detected: ${strategy.documentType}`);

// ✅ Approve and create config
await rag.approveStrategy(strategy.id);

// 📥 Ingest document
const result = await rag.ingest({
  file: './document.pdf',
  onProgress: (status) => console.log(`Batch ${status.current}/${status.total}`),
});

// 🔎 Search
const results = await rag.search({
  query: 'What are the key findings?',
  mode: 'hybrid',
  limit: 10,
});

results.forEach((r) => {
  console.log(`[${r.score.toFixed(2)}] ${r.chunk.displayContent.slice(0, 100)}...`);
});
```

---

## 🧠 Contextual Retrieval

Context-RAG implements [Anthropic's Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) approach using Gemini Files API.

### The Problem

A chunk like `"Value: 50 mg/dL"` alone has no context. Searching for "Cyanide test" won't find it.

### The Solution

Each chunk gets contextual information prepended:

```
"This chunk is from the Biochemistry Test Results table, showing 
the Cyanide test value for patient Ahmet Yılmaz. Value: 50 mg/dL"
```

### Configuration

```typescript
const rag = new ContextRAG({
  // ...
  ragEnhancement: {
    approach: 'anthropic_contextual',
    strategy: 'llm',           // Best quality, uses Gemini
    skipChunkTypes: ['HEADING', 'IMAGE_REF'],
    concurrencyLimit: 5,
  },
});
```

| Strategy | Cost | Quality Improvement |
|----------|------|---------------------|
| `none` | $0 | Baseline |
| `simple` | $0 | +20% (template-based) |
| `llm` | ~$0.005/chunk | +49% (Gemini-generated) |

---

<details>
<summary>🎯 Reranking (Advanced)</summary>

Reranking improves search relevance by re-scoring candidates using AI models. Based on [Anthropic's Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) research, it reduces retrieval failure rate by ~67%.

### How It Works

1. **Initial Retrieval:** Get top N candidates (e.g., 50) via vector similarity
2. **Reranking:** AI model scores each candidate's relevance to the query  
3. **Final Selection:** Return top K (e.g., 5) based on reranked scores

### Configuration

```typescript
const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
  
  // Reranking configuration
  rerankingConfig: {
    enabled: true,
    provider: 'gemini',        // 'gemini' (free) or 'cohere' (10K/month free)
    cohereApiKey: process.env.COHERE_API_KEY, // Required if provider is 'cohere'
    defaultCandidates: 50,     // Get 50 candidates from vector search
    defaultTopK: 10,           // Return top 10 after reranking
  },
});
```

### Per-Query Reranking

```typescript
const results = await rag.search({
  query: 'metabolizma ve enerji üretimi',
  limit: 5,
  useReranking: true,          // Enable reranking for this query
  rerankCandidates: 50,        // Get 50 candidates, rerank to top 5
});

// Results include reranking metadata
results.forEach(r => {
  console.log(`Score: ${r.score}`);
  console.log(`Reranked: ${r.explanation?.reranked}`);
  console.log(`Original rank: ${r.explanation?.originalRank}`);
});
```

### Provider Comparison

| Provider | Cost | Quality | Best For |
|----------|------|---------|----------|
| **Gemini** | Free (uses existing quota) | Good | Cost-sensitive, general use |
| **Cohere** | Free tier: 10K/month | Excellent | Multilingual, production |

</details>

<details>
<summary>🎯 Custom Prompt / Filtered Extraction (Advanced)</summary>

Extract only specific content types without going through the Discovery flow:

```typescript
// Extract ONLY specific types with custom prompt
const result = await rag.ingest({
  file: './book.pdf',
  customPrompt: `
    Extract ONLY these content types:
    - TEXT: Normal paragraphs
    - QUESTION: Multiple choice questions
    - LIST: Bulleted or numbered lists
    - TABLE: Data tables

    SKIP these types:
    - HEADING, CODE, QUOTE, IMAGE_REF
  `,
  // Context enrichment only for TEXT chunks (cost optimization)
  // Configure via ragEnhancement.skipChunkTypes
});
```

### Configuration for Selective Context Enrichment

```typescript
const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
  
  ragEnhancement: {
    approach: 'anthropic_contextual',
    strategy: 'llm',
    // Only TEXT chunks get context enrichment
    // Other types (TABLE, LIST, QUESTION) are extracted but not enriched
    skipChunkTypes: ['HEADING', 'IMAGE_REF', 'TABLE', 'CODE', 'QUOTE', 'MIXED', 'QUESTION', 'LIST'],
  },
});

// PromptConfig is auto-created when using customPrompt
await rag.ingest({
  file: './document.pdf',
  customPrompt: 'Your custom extraction instructions...',
});
```

> **Note:** When using `customPrompt` without `promptConfigId`, the system automatically creates a PromptConfig for you.

</details>

---

## ⚙️ Configuration

```typescript
## ⚙️ Configuration Reference

Context-RAG is highly configurable. Below is the complete list of all available options.

```typescript
const rag = new ContextRAG({
  // ============================================
  // CORE CONFIGURATION (Required)
  // ============================================

  /** Your initialized Prisma client instance */
  prisma: prismaClient,

  /** Gemini API Key (Required for generation and default embeddings) */
  geminiApiKey: process.env.GEMINI_API_KEY!,

  // ============================================
  // MODEL SELECTION
  // ============================================

  /** 
   * Main LLM model for generation, orchestration, and RAG enhancement.
   * Default: 'gemini-1.5-pro'
   */
  model: 'gemini-1.5-pro', // Options: 'gemini-1.5-flash', 'gemini-2.0-flash-exp', etc.

  /**
   * Configuration for the LLM generation (temperature, tokens, etc.)
   */
  generationConfig: {
    temperature: 0.3,        // Creativity (0.0 - 1.0). Lower is more deterministic.
    maxOutputTokens: 8192,   // Maximum length of the generated response.
  },

  // ============================================
  // EMBEDDING PROVIDER (Optional)
  // ============================================

  /**
   * Choose your embedding provider.
   * Default: Uses Gemini 'text-embedding-004'
   */
  embeddingProvider: {
    // Provider: 'gemini' | 'openai' | 'cohere'
    provider: 'openai', 

    // Model name (specific to the provider)
    model: 'text-embedding-3-small',

    // API Key (if different from geminiApiKey)
    apiKey: process.env.OPENAI_API_KEY,
  },

  // ============================================
  // SYSTEM CONFIGURATION
  // ============================================

  /**
   * Batch processing settings for ingestion.
   * Adjust these based on your API rate limits.
   */
  batchConfig: {
    pagesPerBatch: 15,       // How many pages to process in one go (Default: 15)
    maxConcurrency: 3,       // How many batches to run in parallel (Default: 3)
    maxRetries: 3,           // Retry failed batches (Default: 3)
    retryDelayMs: 1000,      // Initial delay before retry (Default: 1000ms)
    backoffMultiplier: 2,    // Exponential backoff factor (Default: 2)
  },

  /**
   * Settings for splitting text into vector chunks.
   */
  chunkConfig: {
    maxTokens: 500,          // Maximum size of a single chunk (Default: 500)
    overlapTokens: 50,       // Overlap between chunks to preserve continuity (Default: 50)
  },

  /**
   * API Rate Limiting protection.
   */
  rateLimitConfig: {
    requestsPerMinute: 60,   // Max RPM allowed (Default: 60)
    adaptive: true,          // Automatically slow down if 429 errors occur (Default: true)
  },

  /**
   * System logging configuration.
   */
  logging: {
    level: 'info',           // 'debug' | 'info' | 'warn' | 'error'
    structured: true,        // Use JSON format for logs (Best for production tools like Datadog/CloudWatch)
  },

  // ============================================
  // ADVANCED FEATURES
  // ============================================

  /**
   * Reranking improves search relevance by re-scoring results.
   */
  rerankingConfig: {
    enabled: true,           // Enable automatic reranking (Default: false)
    provider: 'cohere',      // 'gemini' or 'cohere' (Cohere is recommended for best results)
    cohereApiKey: process.env.COHERE_API_KEY, // Required if provider is 'cohere'
    defaultCandidates: 50,   // Retrieve top 50 from Vector DB...
    defaultTopK: 10,         // ...and return top 10 after reranking.
  },

  /**
   * RAG Enhancement (Contextual Retrieval).
   * Adds context to chunks before embedding them.
   */
  ragEnhancement: {
    // Approach: 'anthropic_contextual' (Recommended) or 'none'
    approach: 'anthropic_contextual',

    // Strategy: 'llm' (Best Quality) or 'simple' (Template based)
    strategy: 'llm',

    // Model to use for generating context (Optional, defaults to main model)
    // Tip: Use a cheaper model here (e.g., 'gemini-1.5-flash') to save costs.
    model: 'gemini-1.5-flash',

    // Prompt used to generate context (Optional, has good default)
    contextPrompt: 'Situate this chunk within the document...',

    // Don't waste tokens generating context for these types
    skipChunkTypes: ['HEADING', 'IMAGE_REF', 'CODE'], 
  },

  /** 
   * Enable Structured Output (JSON Schema) for reliable parsing.
   * Disable only if you are using a model that doesn't support it well.
   * Default: true 
   */
  useStructuredOutput: true,

  /**
   * Custom Chunk Type Mapping.
   * Map your custom extraction types to system types for proper handling.
   */
  chunkTypeMapping: {
    'RECIPE': 'TEXT',        // Treat 'RECIPE' as normal text
    'INGREDIENT_LIST': 'LIST', // Treat 'INGREDIENT_LIST' as a list
    'NUTRITIONAL_INFO': 'TABLE' // Treat 'NUTRITIONAL_INFO' as a table
  }
});
```

---

## 📚 API Reference

### Discovery

```typescript
const strategy = await rag.discover({
  file: pdfBuffer,
  documentTypeHint: 'Medical',
});

await rag.approveStrategy(strategy.id);
```

### Ingestion

```typescript
const result = await rag.ingest({
  file: pdfBuffer,
  filename: 'report.pdf',
  documentType: 'Medical',
  experimentId: 'exp_v1',  // For A/B testing
  skipExisting: true,
  onProgress: (status) => console.log(status),
});
```

### Search

```typescript
const results = await rag.search({
  query: 'medication interactions',
  mode: 'hybrid',
  limit: 20,
  minScore: 0.5,
  filters: {
    documentTypes: ['Medical'],
    chunkTypes: ['TABLE', 'TEXT'],
  },
  typeBoost: {
    TABLE: 1.5,
  },
});
```

---

## 📤 Publishing to npm

If you want to publish your own fork:

```bash
# 1. Login to npm
npm login

# 2. Build the package
pnpm build

# 3. Publish (first time)
npm publish --access public

# 4. Publish update
npm version patch  # or minor/major
npm publish
```

---

## 🧪 Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Lint
pnpm lint

# Type check
pnpm typecheck

# Run demo
pnpm demo
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/ContextRAG.git`
3. **Install** dependencies: `pnpm install`
4. **Create** a branch: `git checkout -b feature/amazing-feature`

### Making Changes

1. Make your changes
2. Run linting: `pnpm lint`
3. Run build: `pnpm build`
4. Test your changes locally

### Submitting a PR

1. **Commit** your changes: `git commit -m 'feat: add amazing feature'`
2. **Push** to your fork: `git push origin feature/amazing-feature`
3. Open a **Pull Request**

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code change that neither fixes nor adds
- `test:` Adding tests
- `chore:` Build process or auxiliary tool changes

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Meaningful variable/function names
- JSDoc comments for public APIs

---

## 📁 Project Structure

```
context-rag/
├── src/
│   ├── context-rag.ts       # Main facade class
│   ├── engines/             # Discovery, Ingestion, Retrieval
│   ├── enhancements/        # RAG Enhancement handlers
│   │   └── anthropic/       # Anthropic Contextual Retrieval
│   ├── services/            # Gemini API, PDF Processor
│   ├── database/            # Prisma repositories
│   ├── config/              # Templates
│   ├── types/               # TypeScript types
│   ├── utils/               # Logger, Retry, RateLimiter
│   └── errors/              # Custom error classes
├── examples/                # Demo scripts
├── prisma/                  # Reference schema
└── dist/                    # Built output
```

---

## 📄 License

MIT © [Muhammed Bayindir](https://github.com/msbayindir)

---

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for the Contextual Retrieval research
- [Google](https://ai.google.dev/) for Gemini API and Files API
- [pgvector](https://github.com/pgvector/pgvector) for PostgreSQL vector support
