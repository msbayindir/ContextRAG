# Context-RAG Demo Setup

## Prerequisites

1. **PostgreSQL with pgvector**
   ```bash
   # macOS with Homebrew
   brew install postgresql@15 pgvector
   
   # Start PostgreSQL
   brew services start postgresql@15
   
   # Create database
   createdb context_rag_demo
   
   # Install pgvector extension
   psql -d context_rag_demo -c "CREATE EXTENSION IF NOT EXISTS vector"

   
   ```

2. **Environment Variables**
   ```bash
   export DATABASE_URL="postgresql://localhost/context_rag_demo"
   export GEMINI_API_KEY="your-gemini-api-key"
   ```

3. **Initialize Prisma Schema**
   ```bash
   # Add Context-RAG models to schema
   npx context-rag init
   
   # Generate Prisma client and run migrations
   npx prisma generate
   npx prisma migrate dev --name init
   ```

## Running the Demo

1. Add a test PDF file:
   ```bash
   cp /path/to/your/document.pdf examples/test.pdf
   ```

2. Run the full demo:
   ```bash
   npx tsx examples/demo.ts
   ```

3. **NEW:** Run the filtered extraction demo:
   ```bash
   npx tsx examples/filtered-extraction-demo.ts
   ```

### Filtered Extraction Demo

The `filtered-extraction-demo.ts` demonstrates:
- **Custom Prompt:** Extract only TEXT, QUESTION, LIST, TABLE (skip HEADING, CODE, etc.)
- **Selective Context:** Context enrichment only for TEXT chunks (cost optimization)
- **Search Filtering:** Query only specific chunk types

This is useful when you want to:
- Extract specific content types from a document
- Reduce context generation costs by skipping non-essential chunks
- Focus RAG search on particular content categories

## Expected Output

```
🧠 Context-RAG Demo

==================================================

📦 Initializing Prisma...
✅ Database connected
✅ pgvector extension found

🔧 Initializing Context-RAG...

🏥 Running health check...
   Status: healthy
   Database: ✅
   pgvector: ✅

📄 Found test PDF: examples/test.pdf

==================================================
🔍 DISCOVERY DEMO
==================================================

   Analyzing document...

   📋 Discovery Results:
      ID: abc123
      Document Type: Technical
      Confidence: 85.0%
      Page Count: 10
      Elements Detected: 3
      Elements:
        - table: 5
        - list: 12
        - heading: 8

   💡 Suggested Strategy:
      Max Tokens: 800
      Split By: section
      Preserve Tables: true

   ✅ Approving strategy...
      Created Prompt Config: xyz789

==================================================
📥 INGESTION DEMO
==================================================

   Processing document...

   📦 Batch 1/2 PROCESSING pages 1-5
   📦 Batch 1/2 COMPLETED pages 1-5
   📦 Batch 2/2 PROCESSING pages 6-10
   📦 Batch 2/2 COMPLETED pages 6-10

   ✅ Ingestion Complete!
      Document ID: doc-123
      Status: COMPLETED
      Chunks Created: 25
      Batches: 2
      Failed Batches: 0
      Processing Time: 15234ms
      Token Usage:
        Input: 12500
        Output: 8000
        Total: 20500

==================================================
🔎 SEARCH DEMO
==================================================

   Query: "What is the main topic of this document?"

   [1] Score: 0.892
       Type: TEXT
       Content: This document provides an overview of...

==================================================
📊 FINAL STATS
==================================================

   Documents: 1
   Chunks: 25
   Prompt Configs: 1
   Storage: 128.50 KB

✨ Demo complete!
```

## Troubleshooting

### pgvector not found
```sql
-- Manual installation
CREATE EXTENSION IF NOT EXISTS vector;
```

### Prisma client errors
```bash
npx prisma generate
```

### Rate limit errors
Reduce concurrency:
```typescript
batchConfig: {
    maxConcurrency: 1,
    pagesPerBatch: 5,
}
```
