import { EventEmitter } from 'events';
import type { BatchStatus, IngestResult } from '../types/ingestion.types.js';
import type { DiscoveryResult } from '../types/discovery.types.js';
import type { SearchResponse } from '../types/search.types.js';

/**
 * Event types emitted by Context-RAG
 */
export interface ContextRAGEvents {
    // Ingestion events
    'ingest:start': { documentId: string; filename: string; pageCount: number };
    'ingest:batch': BatchStatus;
    'ingest:complete': IngestResult;
    'ingest:error': { documentId: string; error: Error };

    // Discovery events
    'discovery:start': { correlationId: string };
    'discovery:complete': DiscoveryResult;
    'discovery:error': { correlationId: string; error: Error };

    // Search events
    'search:start': { query: string; correlationId: string };
    'search:complete': SearchResponse & { correlationId: string };

    // Health events
    'health:check': { status: 'healthy' | 'degraded' | 'unhealthy' };
}

/**
 * Type-safe event emitter for Context-RAG
 */
export class ContextRAGEventEmitter extends EventEmitter {
    emit<K extends keyof ContextRAGEvents>(
        event: K,
        data: ContextRAGEvents[K]
    ): boolean {
        return super.emit(event, data);
    }

    on<K extends keyof ContextRAGEvents>(
        event: K,
        listener: (data: ContextRAGEvents[K]) => void
    ): this {
        return super.on(event, listener);
    }

    once<K extends keyof ContextRAGEvents>(
        event: K,
        listener: (data: ContextRAGEvents[K]) => void
    ): this {
        return super.once(event, listener);
    }

    off<K extends keyof ContextRAGEvents>(
        event: K,
        listener: (data: ContextRAGEvents[K]) => void
    ): this {
        return super.off(event, listener);
    }
}

/**
 * Create a new event emitter instance
 */
export function createEventEmitter(): ContextRAGEventEmitter {
    return new ContextRAGEventEmitter();
}
