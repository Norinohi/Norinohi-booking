/**
 * Sentry wiring for the API server. It is an evlog drain, so this file only turns
 * environment variables into the shared config — see
 * packages/observability for why the integration lives at the drain layer.
 *
 * With no DSN set this registers nothing and the server logs exactly as
 * it did before.
 */
import { env } from "@yacht-charter/env/server";
import { createObservability } from "@yacht-charter/observability";

export const observability = createObservability({
  sentryDsn: env.SENTRY_DSN,
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
