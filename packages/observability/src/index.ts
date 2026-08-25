import type { DrainContext } from "evlog";
import { createDrainPipeline } from "evlog/pipeline";
import { createPostHogDrain } from "evlog/posthog";
import { createSentryDrain } from "evlog/sentry";

/*
 * Error tracking (Sentry) and product analytics (PostHog) as evlog drains rather
 * than as their own SDKs. Every request already produces one wide event carrying
 * the user, route, status and duration, so a drain is the whole integration: no
 * second instrumentation layer to keep in sync, and nothing new in the dependency
 * tree — evlog ships both adapters.
 *
 * Every field below is optional on purpose. Credentials arrive later, and until
 * they do `createObservability` returns no drain at all, which leaves logging
 * exactly as it is today instead of failing a boot or posting to a dead endpoint.
 */
export interface ObservabilityConfig {
  sentryDsn?: string | undefined;
  posthogApiKey?: string | undefined;
  posthogHost?: string | undefined;
  /** Both vendors group by this; leave unset to inherit the event's own values. */
  environment?: string | undefined;
  release?: string | undefined;
}

export interface Observability {
  /**
   * `undefined` when no credentials are configured, which is what every evlog
   * entry point already treats as "console only".
   */
  drain: ((ctx: DrainContext) => Promise<void>) | undefined;
  /**
   * Sends whatever is still buffered. Call before a process that logged is
   * allowed to exit, otherwise the last batch dies with it — which is exactly
   * the batch a crashing job needs delivered.
   */
  flush: () => Promise<void>;
}

/*
 * Batching is what makes a drain affordable: one HTTP request per wide event
 * would add a round trip to every request we serve. The 5s ceiling keeps a quiet
 * service's errors from sitting in the buffer for minutes.
 */
const BATCH = { batch: { size: 50, intervalMs: 5_000 } } as const;

export function createObservability(config: ObservabilityConfig): Observability {
  const drains: Array<(ctx: DrainContext) => void | Promise<void>> = [];
  const flushes: Array<() => Promise<void>> = [];

  if (config.sentryDsn) {
    const drain = createDrainPipeline<DrainContext>(BATCH)(
      createSentryDrain({
        dsn: config.sentryDsn,
        environment: config.environment,
        release: config.release,
      }),
    );
    drains.push(drain);
    flushes.push(drain.flush);
  }

  if (config.posthogApiKey) {
    const drain = createDrainPipeline<DrainContext>(BATCH)(
      createPostHogDrain({
        apiKey: config.posthogApiKey,
        host: config.posthogHost,
      }),
    );
    drains.push(drain);
    flushes.push(drain.flush);
  }

  return {
    // One slow vendor must not delay the other, and neither may reject into a
    // logging call site: a failed drain is a dropped event, not a failed request.
    drain:
      drains.length === 0
        ? undefined
        : async (ctx) => {
            await Promise.allSettled(drains.map((drain) => drain(ctx)));
          },
    flush: async () => {
      await Promise.allSettled(flushes.map((flush) => flush()));
    },
  };
}
