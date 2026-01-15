# 🧠 Context-RAG

**A powerful, multimodal RAG engine with contextual retrieval, auto-prompt discovery, and PostgreSQL-native vector search.**

[![npm version](https://badge.fury.io/js/context-rag.svg)](https://www.npmjs.com/package/context-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔍 **Discovery Agent** | AI automatically analyzes documents and suggests optimal chunking strategies |
| 📄 **Multimodal Processing** | Uses Gemini Vision API to understand tables, charts, and layouts |
| 📝 **Markdown Output** | Tables and lists converted to rich Markdown format |
| 🎯 **Contextual Retrieval** | Separate search and display content for optimal results |
| 🐘 **PostgreSQL Native** | No external vector DB needed, uses pgvector |
| 🔄 **Hybrid Search** | Combines semantic and keyword search |
| ⚡ **Batch Processing** | Concurrent processing with automatic retry |
| 📊 **Progress Events** | Type-safe event emitter for real-time tracking |

---

## 📦 Installation

```bash
# npm
npm install context-rag

# pnpm
pnpm add context-rag

# yarn
yarn add context-rag
```

### Prerequisites

- Node.js 18+
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- Gemini API key

---

## 🚀 Quick Start

### 1. Setup Database

```bash
# Add Context-RAG models to your Prisma schema
npx context-rag init

# Enable pgvector extension
psql -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
npx prisma migrate dev
```

### 2. Initialize & Use

```typescript
import { ContextRAG } from 'context-rag';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
});

// 🔍 Discover optimal strategy
const strategy = await rag.discover({ file: './document.pdf' });
console.log(`Detected: ${strategy.documentType} (${Math.round(strategy.confidence * 100)}% confidence)`);

// ✅ Approve and create config
await rag.approveStrategy(strategy.id);

// 📥 Ingest document
const result = await rag.ingest({
  file: './document.pdf',
  onProgress: (status) => {
    console.log(`Batch ${status.current}/${status.total}`);
  },
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

## ⚙️ Configuration

```typescript
const rag = new ContextRAG({
  // Required
  prisma: prismaClient,
  geminiApiKey: 'your-api-key',

  // Model selection
  model: 'gemini-1.5-pro',           // 'gemini-1.5-flash' | 'gemini-2.0-flash-exp'
  embeddingModel: 'text-embedding-004',

  // Batch processing
  batchConfig: {
    pagesPerBatch: 15,
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
  },

  // Chunking
  chunkConfig: {
    maxTokens: 500,
    overlapTokens: 50,
  },

  // Rate limiting
  rateLimitConfig: {
    requestsPerMinute: 60,
    adaptive: true,
  },

  // Logging
  logging: {
    level: 'info',
    structured: true,
  },
});
```

---

## 📚 API Reference

### Discovery

```typescript
// Analyze document
const strategy = await rag.discover({
  file: pdfBuffer,           // Buffer or file path
  documentTypeHint: 'Medical', // Optional hint
});

// Approve with overrides
await rag.approveStrategy(strategy.id, {
  documentType: 'Custom Type',
  chunkStrategy: { maxTokens: 1000 },
});
```

### Prompt Configuration

```typescript
// Create custom config
await rag.createPromptConfig({
  documentType: 'Legal',
  name: 'Legal Contracts',
  systemPrompt: 'Extract contract clauses with attention to...',
  chunkStrategy: {
    maxTokens: 800,
    preserveTables: true,
  },
  setAsDefault: true,
});

// List configs
const configs = await rag.getPromptConfigs({ documentType: 'Legal' });

// Activate version
await rag.activatePromptConfig(configId);
```

### Ingestion

```typescript
const result = await rag.ingest({
  file: pdfBuffer,
  filename: 'report.pdf',
  documentType: 'Medical',
  skipExisting: true,
  onProgress: (status) => {
    console.log(`${status.status}: pages ${status.pageRange.start}-${status.pageRange.end}`);
  },
});

// Result
// {
//   documentId: 'uuid',
//   status: 'COMPLETED',
//   chunkCount: 42,
//   batchCount: 5,
//   processingMs: 12500,
// }
```

### Search

```typescript
// Simple
const results = await rag.search({ query: 'your query' });

// Advanced
const results = await rag.search({
  query: 'medication interactions',
  mode: 'hybrid',              // 'semantic' | 'keyword' | 'hybrid'
  limit: 20,
  minScore: 0.5,
  filters: {
    documentTypes: ['Medical'],
    chunkTypes: ['TABLE', 'TEXT'],
    minConfidence: 0.8,
  },
  typeBoost: {
    TABLE: 1.5,
    LIST: 1.2,
  },
  includeExplanation: true,
});

// With metadata
const response = await rag.searchWithMetadata({ query: 'your query' });
console.log(`Found ${response.metadata.totalFound} in ${response.metadata.processingTimeMs}ms`);
```

### Admin

```typescript
// Health check
const health = await rag.healthCheck();
// { status: 'healthy', database: true, pgvector: true }

// Statistics
const stats = await rag.getStats();
// { totalDocuments: 10, totalChunks: 500, promptConfigs: 3, storageBytes: 1024000 }

// Delete document
await rag.deleteDocument(documentId);
```

---

## 🧪 Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Lint
pnpm lint
```

---

## 📁 Project Structure

```
context-rag/
├── src/
│   ├── context-rag.ts       # Main class
│   ├── engines/             # Ingestion, Retrieval, Discovery
│   ├── services/            # Gemini API, PDF Processor
│   ├── database/            # Repository pattern
│   ├── types/               # TypeScript types & Zod schemas
│   ├── utils/               # Logger, Retry, RateLimiter
│   └── errors/              # Custom error classes
├── tests/                   # Unit tests (59 tests)
├── prisma/                  # Reference schema
└── .github/workflows/       # CI/CD
```

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

---

## 📄 License

MIT © Muhammed Bayindir
