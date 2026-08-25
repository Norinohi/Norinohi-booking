import { timingSafeEqual } from "node:crypto";

import { serve } from "@hono/node-server";
import {
  createContext,
  getEnabledInventoryProviders,
  inventoryProvider,
} from "@yacht-charter/api/context";
import { sweepExpiries } from "@yacht-charter/api/services/expiry";
import { sendBalanceReminders } from "@yacht-charter/api/services/payment-reminders";
import { drainOutbox } from "@yacht-charter/api/services/outbox";
import {
  startAvailabilitySync,
  startCatalogueSync,
  startSyncForAll,
} from "@yacht-charter/api/services/provider-sync";
import { handleStripeWebhook } from "@yacht-charter/api/services/stripe-webhook";
import { auth } from "@yacht-charter/auth";
import { db } from "@yacht-charter/db";
import { env } from "@yacht-charter/env/server";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateAuthOpenApiSchema } from "./auth-openapi";
import { flushObservabilityOnShutdown, observability } from "./observability";
import { apiHandler, rpcHandler } from "./orpc";

// Transport wiring only — logic lives in packages/api. Middleware order is
// load-bearing (see AGENTS.md).

initLogger({
  env: { service: "yacht-charter-server" },
  drain: observability.drain,
});

flushObservabilityOnShutdown();

// SAFETY: evlog only calls `api.getSession`, which this instance has. It types the
// resolved user and session as `Record<string, unknown>`, and better-auth returns
// interface-typed objects, which TypeScript refuses to widen to an index signature
// even though every field is a plain JSON value.
const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const app = new Hono<EvlogVariables>();

app.use(evlog());

app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/api/auth/open-api/generate-schema", async (c) => {
  return c.json(await generateAuthOpenApiSchema(auth));
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Must sit above the oRPC dispatch below, which matches "/*" and would otherwise
// swallow this path. Reads the raw body — signature verification is computed over
// the exact bytes Stripe sent, so it must not be parsed first.
app.post("/api/stripe/webhook", async (c) => {
  const outcome = await handleStripeWebhook(
    db,
    inventoryProvider,
    await c.req.text(),
    c.req.header("stripe-signature") ?? null,
  );

  // A rejected signature is a 400 so Stripe stops retrying a request we will
  // never accept; a handled duplicate is a 200 because redelivery is normal.
  // `note` carries an outcome ops should see — a provider refusal and its refund —
  // without failing the delivery, which is what would make a real fault stand out.
  if (!outcome.handled) return c.json({ error: outcome.reason }, 400);
  return c.json({ received: true, duplicate: outcome.duplicate, note: outcome.note });
});

// Scheduled maintenance. Above the oRPC dispatch for the same reason as the Stripe
// route: that middleware matches "/*". Guarded by a shared secret rather than a
// session, because the caller is a scheduler with no user.
app.post("/api/cron/sweep-expiries", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  // Constant-time compare so a wrong secret cannot be discovered byte by byte.
  if (!presented || !timingSafeEqualString(presented, env.CRON_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(await sweepExpiries(db, inventoryProvider));
});

// Daily. The window is ten days wide and every installment is claimed before it is mailed, so
// running this more often sends nothing extra — and missing a day still catches the same booking
// tomorrow.
app.post("/api/cron/payment-reminders", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented || !timingSafeEqualString(presented, env.CRON_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(await sendBalanceReminders(db));
});

// Every few minutes, and normally a no-op: checkout drains the outbox in-process as soon as
// it has answered, so this only picks up what a replaced container or a mailer outage left
// behind. A message is claimed with `for update skip locked`, so this can overlap a
// request-time drain without either sending the other's mail.
app.post("/api/cron/drain-outbox", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented || !timingSafeEqualString(presented, env.CRON_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(await drainOutbox(db));
});

// The vendor asks for one full catalogue dump a day, after 01:00 GMT+1. The run is
// started and then let go: a full sequential walk takes hours and the platform kills
// a long request, so progress lives in sync_run / sync_error instead of the response.
app.post("/api/cron/sync-catalogue", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented || !timingSafeEqualString(presented, env.CRON_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const providers = await getEnabledInventoryProviders();
  return c.json({
    runs: await startSyncForAll(providers.values(), (provider) => startCatalogueSync(db, provider)),
  });
});

// The vendor asks for occupancy hourly or every few hours. Started and let go like
// the catalogue run: the occupancy pass is quick, but the confirmation pass that
// follows it runs until its own time budget stops it.
app.post("/api/cron/sync-availability", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!presented || !timingSafeEqualString(presented, env.CRON_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const providers = await getEnabledInventoryProviders();
  return c.json({
    runs: await startSyncForAll(providers.values(), (provider) =>
      startAvailabilitySync(db, provider),
    ),
  });
});

// Try RPC (/rpc), then OpenAPI (/api-reference), else fall through.
app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, { prefix: "/rpc", context });
  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, { prefix: "/api-reference", context });
  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

/** Length-safe wrapper: timingSafeEqual throws when the buffers differ in size. */
function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
