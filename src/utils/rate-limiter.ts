import type { RateLimitConfig } from '../types/config.types.js';
import { sleep } from './retry.js';

interface RateLimitState {
    tokens: number;
    lastRefill: number;
    currentRpm: number;
    consecutiveSuccesses: number;
    consecutiveFailures: number;
}

/**
 * Token bucket rate limiter with adaptive capabilities
 */
export class RateLimiter {
    private readonly config: RateLimitConfig;
    private state: RateLimitState;
    private readonly minRpm: number;
    private readonly maxRpm: number;
    private readonly intervalMs: number = 60000; // 1 minute

    constructor(config: RateLimitConfig) {
        this.config = config;
        this.minRpm = Math.floor(config.requestsPerMinute * 0.2);
        this.maxRpm = Math.floor(config.requestsPerMinute * 1.5);

        this.state = {
            tokens: config.requestsPerMinute,
            lastRefill: Date.now(),
            currentRpm: config.requestsPerMinute,
            consecutiveSuccesses: 0,
            consecutiveFailures: 0,
        };
    }

    /**
     * Wait until a token is available and consume it
     */
    async acquire(): Promise<void> {
        this.refillTokens();

        while (this.state.tokens < 1) {
            const waitTime = this.calculateWaitTime();
            await sleep(waitTime);
            this.refillTokens();
        }

        this.state.tokens -= 1;
    }

    /**
     * Report a successful request (for adaptive rate limiting)
     */
    reportSuccess(): void {
        if (!this.config.adaptive) return;

        this.state.consecutiveSuccesses += 1;
        this.state.consecutiveFailures = 0;

        // Increase rate after 10 consecutive successes
        if (this.state.consecutiveSuccesses >= 10) {
            this.adjustRate(1.1); // +10%
            this.state.consecutiveSuccesses = 0;
        }
    }

    /**
     * Report a rate limit error (for adaptive rate limiting)
     */
    reportRateLimitError(): void {
        if (!this.config.adaptive) return;

        this.state.consecutiveFailures += 1;
        this.state.consecutiveSuccesses = 0;

        // Decrease rate immediately on rate limit
        this.adjustRate(0.7); // -30%
    }

    /**
     * Get current rate limit status
     */
    getStatus(): { currentRpm: number; availableTokens: number } {
        this.refillTokens();
        return {
            currentRpm: this.state.currentRpm,
            availableTokens: Math.floor(this.state.tokens),
        };
    }

    private refillTokens(): void {
        const now = Date.now();
        const elapsed = now - this.state.lastRefill;
        const tokensToAdd = (elapsed / this.intervalMs) * this.state.currentRpm;

        this.state.tokens = Math.min(
            this.state.tokens + tokensToAdd,
            this.state.currentRpm
        );
        this.state.lastRefill = now;
    }

    private calculateWaitTime(): number {
        const tokensNeeded = 1 - this.state.tokens;
        return Math.ceil((tokensNeeded / this.state.currentRpm) * this.intervalMs);
    }

    private adjustRate(multiplier: number): void {
        const newRpm = Math.floor(this.state.currentRpm * multiplier);
        this.state.currentRpm = Math.max(this.minRpm, Math.min(newRpm, this.maxRpm));
    }
}
