import { createHash } from 'crypto';
import * as fs from 'fs/promises';

/**
 * Calculate SHA-256 hash of a buffer
 */
export function hashBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculate SHA-256 hash of a file
 */
export async function hashFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return hashBuffer(buffer);
}

/**
 * Generate a short hash for display purposes
 */
export function shortHash(hash: string, length: number = 8): string {
    return hash.substring(0, length);
}
