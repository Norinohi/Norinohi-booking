import { env } from "@yacht-charter/env/web";
import { createObservability } from "@yacht-charter/observability";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

/*
 * The Next.js server runs its own evlog instance, separate from the Hono server's,
 * so the drains have to be registered on both sides or route handlers and server
 * components report nowhere. Registers nothing when no credentials are set.
 */
const observability = createObservability({
  sentryDsn: env.SENTRY_DSN,
  environment: env.OBSERVABILITY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: env.OBSERVABILITY_RELEASE,
});

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "yacht-charter-web",
});

/*
 * The drain is registered here and not on `createEvlog` above: this is the global
 * logger config, and the middleware falls back to it, so declaring it in both
 * places would send every event twice.
 */
export const { register, onRequestError } = createInstrumentation({
  service: "yacht-charter-web",
  drain: observability.drain,
});
