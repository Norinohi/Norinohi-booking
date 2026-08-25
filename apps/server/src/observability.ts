/**
 * Sentry and PostHog wiring for the API server. Both are evlog drains, so this
 * file only turns environment variables into the shared config — see
 * packages/observability for why the integration lives at the drain layer.
 *
 * With no credentials set this registers nothing and the server logs exactly as
 * it did before.
 */
import { env } from "@yacht-charter/env/server";
import { createObservability } from "@yacht-charter/observability";

export const observability = createObservability({
  sentryDsn: env.SENTRY_DSN,
  posthogApiKey: env.POSTHOG_API_KEY,
  posthogHost: env.POSTHOG_HOST,
  environment: env.OBSERVABILITY_ENVIRONMENT ?? env.NODE_ENV,
  release: env.OBSERVABILITY_RELEASE,
});

/**
 * Buffered events are lost when the process ends, and a redeploy ends it mid-batch
 * often enough to matter. SIGTERM is what the platform sends first; the flush is
 * awaited before the default handler would have exited.
 */
export function flushObservabilityOnShutdown(): void {
  if (!observability.drain) return;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void observability.flush().finally(() => process.exit(0));
    });
  }
}
