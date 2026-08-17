export interface SequentialQueueOptions {
  /** Idle gap enforced between the end of one task and the start of the next. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const noop = () => undefined;

/**
 * Concurrency of exactly 1 per key. NauSYS forbids parallel calls on one
 * credential ("parallel multi threads are not allowed") for its catalogue and
 * availability sweeps, so this is a correctness constraint there, not a
 * throughput knob. Which calls that covers is the caller's decision — see the
 * lanes in `nausys/client.ts`.
 */
export class SequentialQueue {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly lastFinishedAt = new Map<string, number>();
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: SequentialQueueOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();

    const result = previous.then(async () => {
      await this.waitForInterval(key);
      try {
        return await task();
      } finally {
        this.lastFinishedAt.set(key, this.now());
      }
    });

    // The chain must swallow rejections, otherwise one failed task would reject
    // every task queued behind it.
    const chain = result.then(noop, noop);
    this.chains.set(key, chain);
    void chain.then(() => {
      if (this.chains.get(key) === chain) {
        this.chains.delete(key);
      }
    });

    return result;
  }

  /** Number of keys with an in-flight or queued task. Test/observability aid. */
  activeKeys(): number {
    return this.chains.size;
  }

  private async waitForInterval(key: string): Promise<void> {
    if (this.minIntervalMs <= 0) {
      return;
    }
    const finishedAt = this.lastFinishedAt.get(key);
    if (finishedAt === undefined) {
      return;
    }
    const waitMs = this.minIntervalMs - (this.now() - finishedAt);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }
}

/**
 * Module-scoped so two provider instances constructed in the same process still
 * serialize against the same credential.
 */
export const sharedQueue = new SequentialQueue();

// Lanes are per key (the credential), but the spacing setting is per queue
// instance, so instances are pooled by interval. Module-scoped on purpose: two
// clients built in one process must share the lane, or the vendor's
// sequential-only rule is broken by construction. Sharing this pool across
// providers is safe because queue keys are already provider-namespaced.
const queuesByInterval = new Map<number, SequentialQueue>();

export function queueForInterval(minIntervalMs: number): SequentialQueue {
  if (minIntervalMs <= 0) {
    return sharedQueue;
  }
  const existing = queuesByInterval.get(minIntervalMs);
  if (existing) {
    return existing;
  }
  const queue = new SequentialQueue({ minIntervalMs });
  queuesByInterval.set(minIntervalMs, queue);
  return queue;
}
