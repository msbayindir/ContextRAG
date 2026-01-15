# Context-RAG

> A powerful, multimodal RAG engine with contextual retrieval, auto-prompt discovery, and PostgreSQL-native vector search.

[![npm version](https://badge.fury.io/js/context-rag.svg)](https://www.npmjs.com/package/context-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/your-username/context-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/context-rag/actions/workflows/ci.yml)

## ✨ Features

- **🔍 Discovery Agent** - AI automatically analyzes documents and suggests optimal chunking strategies
- **📄 Multimodal PDF Processing** - Uses Gemini Vision API to understand tables, charts, and layouts
- **📝 Markdown Output** - Tables and lists converted to rich Markdown format
- **🎯 Contextual Retrieval** - Separate search and display content for optimal results
- **🐘 PostgreSQL Native** - No external vector DB needed, uses pgvector
- **🔄 Hybrid Search** - Combines semantic and keyword search
- **⚡ Batch Processing** - Concurrent processing with automatic retry
- **📊 Progress Events** - Type-safe event emitter for real-time progress tracking

## 📦 Installation

```bash
npm install context-rag
# or
pnpm add context-rag
```

## 🚀 Quick Start

```typescript
import { ContextRAG } from 'context-rag';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Initialize the RAG engine
const rag = new ContextRAG({
  prisma,
  geminiApiKey: process.env.GEMINI_API_KEY!,
});

// Option 1: Auto-discover strategy
const strategy = await rag.discover({ file: pdfBuffer });
console.log(`Detected: ${strategy.documentType} (${strategy.confidence * 100}% confidence)`);
await rag.approveStrategy(strategy.id);

// Option 2: Use custom prompt
await rag.createPromptConfig({
  documentType: 'Medical',
  name: 'Medical Documents',
  systemPrompt: 'Extract medical information with focus on medications, dosages, and conditions...',
  chunkStrategy: {
    maxTokens: 800,
    overlapTokens: 100,
    preserveTables: true,
  },
});

// Ingest document with progress tracking
const result = await rag.ingest({
  file: pdfBuffer,
  documentType: 'Medical',
  onProgress: (status) => {
    console.log(`Processing batch ${status.current}/${status.total} (pages ${status.pageRange?.start}-${status.pageRange?.end})`);
  },
});

console.log(`Created ${result.chunkCount} chunks`);

// Search with hybrid mode
const results = await rag.search({
  query: 'What medications affect kidney function?',
  mode: 'hybrid',
  limit: 10,
  filters: {
    documentTypes: ['Medical'],
    minConfidence: 0.7,
  },
});

for (const result of results) {
  console.log(`Score: ${result.score.toFixed(2)}`);
  console.log(result.chunk.displayContent);
}
```

## 🛠️ Setup

### 1. Initialize Prisma Schema

```bash
npx context-rag init
```

This will add the required models to your Prisma schema.

### 2. Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Run migrations

```bash
npx prisma migrate dev
```

## ⚙️ Configuration

```typescript
const rag = new ContextRAG({
  // Required
  prisma: prismaClient,
  geminiApiKey: 'your-api-key',

  // Optional - Model selection
  model: 'gemini-1.5-pro', // or 'gemini-1.5-flash', 'gemini-2.0-flash-exp'
  embeddingModel: 'text-embedding-004',

  // Optional - Batch processing
  batchConfig: {
    pagesPerBatch: 15,    // Pages per batch
    maxConcurrency: 3,    // Parallel batches
    maxRetries: 3,        // Retry attempts
    retryDelayMs: 1000,   // Initial retry delay
    backoffMultiplier: 2, // Exponential backoff
  },

  // Optional - Chunking
  chunkConfig: {
    maxTokens: 500,
    overlapTokens: 50,
  },

  // Optional - Rate limiting
  rateLimitConfig: {
    requestsPerMinute: 60,
    adaptive: true, // Auto-adjust on 429 errors
  },

  // Optional - Logging
  logging: {
    level: 'info', // 'debug' | 'info' | 'warn' | 'error'
    structured: true,
  },
});
```

## 📚 API Reference

### Discovery

```typescript
// Analyze document and get AI-suggested strategy
const strategy = await rag.discover({
  file: pdfBuffer, // or file path
  documentTypeHint: 'Medical', // Optional hint
});

// Approve with optional overrides
const config = await rag.approveStrategy(strategy.id, {
  documentType: 'Custom Type', // Override suggested type
});
```

### Prompt Configuration

```typescript
// Create custom config
const config = await rag.createPromptConfig({
  documentType: 'Legal',
  name: 'Legal Contracts',
  systemPrompt: 'Extract contract clauses...',
  setAsDefault: true,
});

// List configs
const configs = await rag.getPromptConfigs({
  documentType: 'Legal',
  activeOnly: true,
});

// Activate specific version
await rag.activatePromptConfig(configId);
```

### Ingestion

```typescript
const result = await rag.ingest({
  file: pdfBuffer,
  filename: 'document.pdf',
  documentType: 'Medical',
  promptConfigId: 'specific-config-id', // Optional
  skipExisting: true, // Skip if already processed
  onProgress: (status) => {
    console.log(`Batch ${status.current}/${status.total}: ${status.status}`);
  },
});

// Check status
const status = await rag.getDocumentStatus(result.documentId);
```

### Search

```typescript
// Basic search
const results = await rag.search({
  query: 'your search query',
});

// Advanced search
const results = await rag.search({
  query: 'your search query',
  mode: 'hybrid', // 'semantic' | 'keyword' | 'hybrid'
  limit: 20,
  minScore: 0.5,
  filters: {
    documentTypes: ['Medical', 'Legal'],
    chunkTypes: ['TABLE', 'TEXT'],
    minConfidence: 0.8,
    documentIds: ['specific-doc-id'],
  },
  typeBoost: {
    TABLE: 1.5, // Boost tables
    LIST: 1.2,  // Boost lists
  },
  includeExplanation: true,
});

// With full metadata
const response = await rag.searchWithMetadata({
  query: 'your query',
});
console.log(`Found ${response.metadata.totalFound} in ${response.metadata.processingTimeMs}ms`);
```

### Admin

```typescript
// Health check
const health = await rag.healthCheck();
// { status: 'healthy', database: true, pgvector: true }

// Get statistics
const stats = await rag.getStats();
// { totalDocuments: 10, totalChunks: 500, promptConfigs: 3, storageBytes: 1024000 }

// Delete document
await rag.deleteDocument(documentId);
```

## 🧪 Testing

```bash
pnpm test
```

## 📄 License

MIT © Muhammed Bayindir
