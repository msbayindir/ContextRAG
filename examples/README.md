# Context-RAG Examples

This folder contains example scripts demonstrating Context-RAG v2.0 features.

## Quick Start

```bash
# Run any example
npx tsx examples/01-basic-usage.ts
```

## Examples

| File | Description |
|------|-------------|
| [01-basic-usage.ts](./01-basic-usage.ts) | Basic ingest & search workflow |
| [02-discovery-flow.ts](./02-discovery-flow.ts) | AI-powered document analysis |
| [03-hybrid-search.ts](./03-hybrid-search.ts) | Semantic + keyword search |
| [04-reranking.ts](./04-reranking.ts) | Gemini/Cohere reranking |
| [05-custom-extraction.ts](./05-custom-extraction.ts) | Custom prompts for specific content |
| [06-contextual-retrieval.ts](./06-contextual-retrieval.ts) | Anthropic-style context enhancement |
| [07-custom-engine.ts](./07-custom-engine.ts) | Extending engines with custom logic |
| [08-embedding-providers.ts](./08-embedding-providers.ts) | OpenAI/Cohere embeddings |
| [09-error-handling.ts](./09-error-handling.ts) | Production error handling patterns |
| [10-llm-provider-gemini.ts](./10-llm-provider-gemini.ts) | LLM provider: Gemini |
| [11-llm-provider-openai.ts](./11-llm-provider-openai.ts) | LLM provider: OpenAI (Gemini for documents) |
| [12-llm-provider-anthropic.ts](./12-llm-provider-anthropic.ts) | LLM provider: Anthropic (Gemini for documents) |

## Configuration

All examples use environment variables:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/db"
GEMINI_API_KEY="your-gemini-key"
OPENAI_API_KEY="your-openai-key"      # Optional
COHERE_API_KEY="your-cohere-key"      # Optional
ANTHROPIC_API_KEY="your-anthropic-key" # Optional
```

Notes:
- Document/PDF processing currently requires Gemini. When using OpenAI or Anthropic
  as the primary LLM, set `documentProvider` to Gemini in config.

## Test PDF

A sample `test.pdf` is included for testing. Replace with your own documents.


