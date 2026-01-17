/**
 * No-Op Enhancement Handler
 * 
 * Default handler that does nothing - maintains backward compatibility.
 */

import type { EnhancementHandler } from '../types/rag-enhancement.types.js';

export class NoOpHandler implements EnhancementHandler {
    shouldSkip(): boolean {
        return true; // Skip all - no context generation
    }

    async generateContext(): Promise<string> {
        return '';
    }
}
