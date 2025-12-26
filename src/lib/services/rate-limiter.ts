/**
 * Rate Limit Handler Service
 *
 * Provides exponential backoff and retry logic for API calls.
 * Prevents crashes during high load or API rate limits.
 *
 * Features:
 * - Exponential backoff (1s, 2s, 4s, 8s, 16s)
 * - Parses provider-specific wait times from error messages
 * - Minimum interval between requests
 * - Configurable max retries
 *
 * Usage:
 *   const result = await rateLimiter.execute(() => apiCall());
 */

export interface RateLimiterConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  minRequestIntervalMs: number;
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,      // 1 second
  maxDelayMs: 32000,      // 32 seconds max
  minRequestIntervalMs: 100,  // 100ms between requests
};

export class RateLimitHandler {
  private config: RateLimiterConfig;
  private lastRequestTime: number = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
  }

  /**
   * Execute a function with rate limit protection.
   * Automatically retries on rate limit errors with exponential backoff.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Ensure minimum interval between requests
    await this.enforceMinInterval();

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.lastRequestTime = Date.now();
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // If not a rate limit error, don't retry
        if (!this.isRateLimitError(error)) {
          throw error;
        }

        // If max retries reached, throw
        if (attempt === this.config.maxRetries) {
          console.error(`[RateLimit] Max retries (${this.config.maxRetries}) exceeded`);
          throw error;
        }

        // Calculate wait time
        const waitTime = this.calculateWaitTime(error, attempt);
        console.log(`[RateLimit] Attempt ${attempt}/${this.config.maxRetries} failed, waiting ${waitTime}ms...`);

        await this.sleep(waitTime);
      }
    }

    throw lastError;
  }

  /**
   * Execute multiple functions with rate limiting.
   * Useful for batch operations.
   */
  async executeAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];

    for (const fn of fns) {
      const result = await this.execute(fn);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if error is a rate limit error.
   */
  private isRateLimitError(error: unknown): boolean {
    const errorStr = String(error).toLowerCase();
    return (
      errorStr.includes('rate limit') ||
      errorStr.includes('rate_limit') ||
      errorStr.includes('429') ||
      errorStr.includes('too many requests') ||
      errorStr.includes('request_limit') ||
      errorStr.includes('throttl') ||
      errorStr.includes('quota exceeded')
    );
  }

  /**
   * Calculate wait time with exponential backoff.
   * Also parses provider-specific wait times from error messages.
   */
  private calculateWaitTime(error: unknown, attempt: number): number {
    const errorStr = String(error);

    // Try to extract wait time from error message
    // OpenAI style: "Please try again in 1.242s"
    const secondsMatch = errorStr.match(/try again in (\d+\.?\d*)s/i);
    if (secondsMatch) {
      const parsed = Math.ceil(parseFloat(secondsMatch[1]) * 1000);
      return Math.min(parsed, this.config.maxDelayMs);
    }

    // Anthropic style: "Please retry after X seconds"
    const retryMatch = errorStr.match(/retry after (\d+)/i);
    if (retryMatch) {
      const parsed = parseInt(retryMatch[1], 10) * 1000;
      return Math.min(parsed, this.config.maxDelayMs);
    }

    // MS style: "Retry-After: X"
    const retryAfterMatch = errorStr.match(/retry-after:\s*(\d+)/i);
    if (retryAfterMatch) {
      const parsed = parseInt(retryAfterMatch[1], 10) * 1000;
      return Math.min(parsed, this.config.maxDelayMs);
    }

    // Default: exponential backoff (1s, 2s, 4s, 8s, 16s, ...)
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(exponentialDelay, this.config.maxDelayMs);
  }

  /**
   * Enforce minimum interval between requests.
   */
  private async enforceMinInterval(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.config.minRequestIntervalMs) {
      const waitTime = this.config.minRequestIntervalMs - elapsed;
      await this.sleep(waitTime);
    }
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update config at runtime.
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset the last request time (useful for testing).
   */
  reset(): void {
    this.lastRequestTime = 0;
  }
}

// SINGLETON INSTANCE

export const rateLimiter = new RateLimitHandler();

// CONVENIENCE WRAPPER

/**
 * Wrap a function with rate limit protection.
 * Creates a new function that automatically handles rate limits.
 *
 * Usage:
 *   const safeApiCall = withRateLimit(apiCall);
 *   const result = await safeApiCall(params);
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config?: Partial<RateLimiterConfig>
): T {
  const handler = config ? new RateLimitHandler(config) : rateLimiter;

  return ((...args: Parameters<T>) => {
    return handler.execute(() => fn(...args));
  }) as T;
}
