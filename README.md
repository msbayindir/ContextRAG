# Context-RAG

> A powerful, multimodal RAG engine with contextual retrieval, auto-prompt discovery, and PostgreSQL-native vector search.

[![npm version](https://badge.fury.io/js/context-rag.svg)](https://www.npmjs.com/package/context-rag)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- **🔍 Discovery Agent** - AI automatically analyzes documents and suggests optimal chunking strategies
- **📄 Multimodal PDF Processing** - Uses Vision API to understand tables, charts, and layouts
- **📝 Markdown Output** - Tables and lists converted to rich Markdown format
- **🎯 Contextual Retrieval** - Separate search and display content for optimal results
- **🐘 PostgreSQL Native** - No external vector DB needed, uses pgvector
- **🔄 Hybrid Search** - Combines semantic and keyword search
- **⚡ Batch Processing** - Concurrent processing with automatic retry

## 📦 Installation

```bash
npm install context-rag
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
const strategy = await rag.discover(pdfBuffer);
await rag.approveStrategy(strategy.id);

// Option 2: Use custom prompt
await rag.createPromptConfig({
  documentType: 'Medical',
  name: 'Medical Documents',
  systemPrompt: 'Extract medical information with focus on...',
});

// Ingest document
const result = await rag.ingest({
  file: pdfBuffer,
  documentType: 'Medical',
  onProgress: (status) => {
    console.log(`Processing batch ${status.current}/${status.total}`);
  },
});

// Search
const results = await rag.search({
  query: 'What medications affect kidney function?',
  limit: 10,
});
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

## 📖 Documentation

Coming soon...

## 📄 License

MIT © Muhammed Bayindir
