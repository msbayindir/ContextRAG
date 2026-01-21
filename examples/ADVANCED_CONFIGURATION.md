# Advanced Configuration & Scenarios

This guide provides comprehensive instructions for configuring Context-RAG with different embedding providers, managing vector migrations, and optimizing retrieval with reranking.

## Table of Contents
1. [Embedding Providers](#1-embedding-providers)
   - [Gemini (Default)](#gemini-default)
   - [OpenAI](#openai)
   - [Cohere (Recommended for Multilingual/Turkish)](#cohere-recommended-for-multilingualturkish)
2. [Vector Migration (Changing Providers)](#2-vector-migration-changing-providers)
3. [Reranking Configuration](#3-reranking-configuration)
4. [Environment Variables](#4-environment-variables)
5. [Contextual Retrieval (Anthropic Strategy)](#5-contextual-retrieval-anthropic-strategy)

---

## 1. Embedding Providers

Context-RAG supports a modular embedding architecture. You can switch between providers by changing the `embeddingProvider` configuration.

### Gemini (Default)
Uses Google's `text-embedding-004` model. Good general performance and free tier availability.

**Configuration:**
```typescript
import { ContextRAG } from '@msbayindir/context-rag';

const rag = new ContextRAG({
    geminiApiKey: process.env.GEMINI_API_KEY,
    // No extra config needed, defaults to Gemini
});
```

### OpenAI
Uses OpenAI's `text-embedding-3` models. Excellent performance and cost-effectiveness.

**Prerequisites:**
- `npm install openai` (Already installed in this project)
- `OPENAI_API_KEY` in environment variables

**Configuration:**
```typescript
const rag = new ContextRAG({
    geminiApiKey: process.env.GEMINI_API_KEY, // Still required for generation
    
    embeddingProvider: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'text-embedding-3-small' // or 'text-embedding-3-large'
    }
});
```

### Cohere (Recommended for Multilingual/Turkish)
Uses Cohere's `embed-multilingual-v3.0`. **Highly recommended for Turkish content.**

**Prerequisites:**
- `COHERE_API_KEY` in environment variables

**Configuration:**
```typescript
const rag = new ContextRAG({
    geminiApiKey: process.env.GEMINI_API_KEY,
    
    embeddingProvider: {
        provider: 'cohere',
        apiKey: process.env.COHERE_API_KEY,
        model: 'embed-multilingual-v3.0' // Native Turkish support
    }
});
```

---

## 2. Vector Migration (Changing Providers)

When you switch embedding providers (e.g., Gemini → Cohere), your existing vectors in the database will be incompatible (different dimensions/latent space).

Context-RAG includes a built-in migration system to handle this **without losing data**.

### Step 1: Detect Mismatch
Run the check command to see the status of your embeddings vs. current config.

```bash
npx context-rag check-embeddings
```

**Output Example:**
```text
⚠️  EMBEDDING MISMATCH DETECTED!
Current Registry: Cohere (1024 dims)
Database Registry: 1500 chunks with Gemini (768 dims)
```

### Step 2: Re-index (Migrate)
Run the reindex command to regenerate vectors using the new provider. Content is preserved; only vectors are updated.

```bash
npx context-rag reindex
```

**Options:**
- `--batch-size <n>`: Number of chunks to process at once (default: 50)
- `--concurrency <n>`: Concurrent requests to provider (default: 5)
- `--force`: Reindex all chunks even if models match

**How it works:**
1. System fetches chunks with incompatible models.
2. Sends the stored text content (prioritizing `enrichedContent`) to the new provider.
3. Updates the `searchVector`, `embeddingModel`, and `embeddingDimension` fields.

---

## 3. Reranking Configuration

Reranking improves search accuracy by re-ordering top results using a high-precision model (Cross-Encoder). Reranking works **independently** of the embedding provider.

### Cohere Rerank (Recommended)
Add this to your configuration to enable reranking.

```typescript
const rag = new ContextRAG({
    // ... other config ...
    
    rerankingConfig: {
        enabled: true,
        provider: 'cohere',
        cohereApiKey: process.env.COHERE_API_KEY,
        defaultCandidates: 50, // Fetch top 50 via vector search
        defaultTopK: 10        // Return top 10 after reranking
    }
});
```

**Why usage remains independent?**
The reranker operates on the *text content* of the retrieved chunks. Even if your retrieval was done using OpenAI embeddings, Cohere Rerank reads the actual text to score relevance, ensuring optimal results regardless of the vector source.

---

## 4. Environment Variables

Create a `.env` file with the following keys based on your chosen stack:

```env
# REQUIRED: Core Generation & Default Embedding
GEMINI_API_KEY=AIzaSy...

# OPTIONAL: OpenAI Embedding
OPENAI_API_KEY=sk-proj...

# OPTIONAL: Cohere Embedding & Reranking
COHERE_API_KEY=v1...

# OPTIONAL: Database (if not using default local)
DATABASE_URL="postgresql://user:password@localhost:5432/contextrag"
```

---

## 5. Contextual Retrieval (Anthropic Strategy)

"Contextual Retrieval" is a specific enhancement strategy (popularized by Anthropic) where each chunk is enriched with context from the wider document before being embedded.

In Context-RAG, this strategy runs on Gemini models, but you can configure **which model** performs this task. This is useful for optimizing cost/speed (e.g., using Flash for context generation while using Pro for reasoning).

**Configuration:**

```typescript
const rag = new ContextRAG({
    // Main Reasoning Model (for answering user queries)
    model: 'gemini-1.5-pro',
    
    // RAG Enhancement Configuration
    ragEnhancement: {
        approach: 'anthropic_contextual',
        strategy: 'llm', // Use LLM to generate context (best quality)
        
        // SPECIFIC MODEL for Context Generation
        // You can select a faster/cheaper model here
        model: 'gemini-1.5-flash',
        
        // Optional: Customize prompt
        contextPrompt: 'Situate this chunk within the document...' 
    }
});
```

**Why configure a separate model?**
- **Cost:** Context generation runs for *every* chunk during ingestion. Using a lighter model (Flash) saves significant tokens.
- **Speed:** Flash models have higher RPM limits and faster generation speeds, speeding up the ingestion pipeline.

---

## 6. Complete Example (The "Power Stack")

The following configuration uses:
1. **Cohere** for Turkish Embeddings (Best quality).
2. **Cohere** for Reranking (High precision).
3. **Gemini 1.5 Pro** for Final Reasoning (High intelligence).
4. **Gemini 1.5 Flash** for Contextual Retrieval (Fast ingestion).

```typescript
import { ContextRAG } from '@msbayindir/context-rag';
import { env } from './src/config/env';

const rag = new ContextRAG({
    // 1. Generation Engine (Gemini 1.5 Pro)
    geminiApiKey: env.GEMINI_API_KEY,
    model: 'gemini-1.5-pro',
    
    // 2. Embedding Engine (Cohere - Multilingual)
    embeddingProvider: {
        provider: 'cohere',
        apiKey: env.COHERE_API_KEY,
        model: 'embed-multilingual-v3.0'
    },
    
    // 3. Reranking (Cohere)
    rerankingConfig: {
        enabled: true,
        provider: 'cohere',
        cohereApiKey: env.COHERE_API_KEY
    },
    
    // 4. Contextual Retrieval (Gemini 1.5 Flash)
    ragEnhancement: {
        approach: 'anthropic_contextual',
        strategy: 'llm',
        model: 'gemini-1.5-flash' // Fast model for ingestion
    }
});
```
