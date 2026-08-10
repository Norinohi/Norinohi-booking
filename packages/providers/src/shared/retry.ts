import { ProviderError, RateLimitedError } from "./errors";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  totalDeadlineMs: number;
  sleep?: (ms: number) => Promise<void>;
  /** Injected so backoff is deterministic under test. */
  random?: () => number;
  now?: () => number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 10_000,
  totalDeadlineMs: 60_000,
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(err: unknown): boolean {
  return err instanceof ProviderError && err.retryable;
}

function backoffDelayMs(attempt: number, policy: RetryPolicy, random: () => number): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * cap);
}

/**
 * Full-jitter exponential backoff. Runs outside any queue slot so a sleeping
 * retry never holds the single sequential lane.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: Partial<RetryPolicy> = {},
): Promise<T> {
  const resolved: RetryPolicy = { ...defaultRetryPolicy, ...policy };
  const sleep = resolved.sleep ?? defaultSleep;
  const random = resolved.random ?? Math.random;
  const now = resolved.now ?? Date.now;
  const startedAt = now();

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= resolved.maxAttempts || !isRetryable(err)) {
        throw err;
      }

      // A vendor-supplied Retry-After wins over our own backoff, uncapped: the
      // provider knows when it will serve us again, we only guess.
      const delayMs =
        err instanceof RateLimitedError && err.retryAfterMs !== undefined
          ? err.retryAfterMs
          : backoffDelayMs(attempt - 1, resolved, random);

      if (now() - startedAt + delayMs > resolved.totalDeadlineMs) {
        throw err;
      }
      await sleep(delayMs);
    }
  }
}
