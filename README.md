# 🧠 Context-RAG

**A powerful, multimodal RAG engine with Anthropic-style Contextual Retrieval, Gemini Files API integration, and PostgreSQL-native vector search.**

[![npm version](https://badge.fury.io/js/context-rag.svg)](https://www.npmjs.com/package/context-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

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
  geminiApiKey: process.env.GEMINI_API_KEY,
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
npm install context-rag
# or
pnpm add context-rag
# or
yarn add context-rag
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

Add Context-RAG models to your `prisma/schema.prisma`:

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

// Context-RAG Models (copy these to your schema)
model ContextRagPromptConfig {
  id              String   @id @default(uuid())
  documentType    String   @map("document_type")
  name            String
  systemPrompt    String   @map("system_prompt") @db.Text
  userPromptTemplate String? @map("user_prompt_template") @db.Text
  chunkStrategy   Json     @map("chunk_strategy")
  version         Int      @default(1)
  isDefault       Boolean  @default(false) @map("is_default")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  chunks          ContextRagChunk[]
  @@unique([documentType, version])
  @@map("context_rag_prompt_configs")
}

model ContextRagChunk {
  id              String   @id @default(uuid())
  promptConfigId  String   @map("prompt_config_id")
  promptConfig    ContextRagPromptConfig @relation(fields: [promptConfigId], references: [id], onDelete: Cascade)
  documentId      String   @map("document_id")
  chunkIndex      Int      @map("chunk_index")
  chunkType       String   @map("chunk_type")
  searchContent   String   @map("search_content") @db.Text
  enrichedContent String?  @map("enriched_content") @db.Text  // Context + searchContent
  contextText     String?  @map("context_text") @db.Text      // Generated context only
  searchVector    Unsupported("vector(768)") @map("search_vector")
  displayContent  String   @map("display_content") @db.Text
  sourcePageStart Int      @map("source_page_start")
  sourcePageEnd   Int      @map("source_page_end")
  confidenceScore Float    @map("confidence_score")
  metadata        Json?
  createdAt       DateTime @default(now()) @map("created_at")
  @@index([documentId])
  @@index([chunkType])
  @@map("context_rag_chunks")
}

model ContextRagDocument {
  id           String   @id @default(uuid())
  filename     String
  fileHash     String   @map("file_hash")
  fileSize     Int      @map("file_size")
  pageCount    Int      @map("page_count")
  documentType String?  @map("document_type")
  promptConfigId String? @map("prompt_config_id")
  experimentId String?  @map("experiment_id")
  modelName    String?  @map("model_name")
  modelConfig  Json?    @map("model_config")
  status       String   @default("PENDING")
  completedBatches Int  @default(0) @map("completed_batches")
  failedBatches Int     @default(0) @map("failed_batches")
  totalBatches Int      @default(0) @map("total_batches")
  tokenUsageInput Int?  @map("token_usage_input")
  tokenUsageOutput Int? @map("token_usage_output")
  tokenUsageTotal Int?  @map("token_usage_total")
  processingMs Int?     @map("processing_ms")
  error        String?  @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  batches      ContextRagBatch[]
  @@unique([fileHash, experimentId])
  @@map("context_rag_documents")
}

model ContextRagBatch {
  id           String   @id @default(uuid())
  documentId   String   @map("document_id")
  document     ContextRagDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  batchIndex   Int      @map("batch_index")
  pageStart    Int      @map("page_start")
  pageEnd      Int      @map("page_end")
  status       String   @default("PENDING")
  tokenUsageInput Int?  @map("token_usage_input")
  tokenUsageOutput Int? @map("token_usage_output")
  tokenUsageTotal Int?  @map("token_usage_total")
  processingMs Int?     @map("processing_ms")
  error        String?  @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@unique([documentId, batchIndex])
  @@map("context_rag_batches")
}
```

Then run migrations:

```bash
npx prisma migrate dev --name add-context-rag
```

### 3. Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
GEMINI_API_KEY="your-gemini-api-key"

# Optional: Cohere API key for better reranking (free tier: 10K/month)
COHERE_API_KEY="your-cohere-api-key"
```

---

## 🚀 Quick Start

```typescript
import { ContextRAG } from 'context-rag';
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

## 🎯 Reranking

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

## 🎯 Custom Prompt / Filtered Extraction

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

---

## ⚙️ Configuration

```typescript
const rag = new ContextRAG({
  // Required
  prisma: prismaClient,
  geminiApiKey: 'your-api-key',

  // Model selection
  model: 'gemini-3-flash-preview',
  embeddingModel: 'gemini-embedding-exp-03-07',

  // Generation
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 16384,
  },

  // Batch processing
  batchConfig: {
    pagesPerBatch: 15,
    maxConcurrency: 3,
    maxRetries: 3,
  },

  // RAG Enhancement
  ragEnhancement: {
    approach: 'anthropic_contextual',
    strategy: 'simple',
    skipChunkTypes: ['HEADING'],
  },
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
