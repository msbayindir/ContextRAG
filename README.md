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
| 🔍 **Discovery Agent** | AI automatically analyzes documents and suggests optimal chunking strategies |
| 📄 **Multimodal Processing** | Uses Gemini Vision API to understand tables, charts, and layouts |
| 🧪 **Experiment System** | A/B test different models on same document for comparison |
| 🎯 **Hybrid Search** | Semantic (vector) + Keyword (full-text) search combination |
| 🐘 **PostgreSQL Native** | No external vector DB needed, uses pgvector |
| ⚡ **Batch Processing** | Concurrent processing with automatic retry |

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
