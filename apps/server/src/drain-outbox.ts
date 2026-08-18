/**
 * The scheduled outbox drain, run from the deployed container — same pattern as
 * sweep-expiries.ts. Calls the same `drainOutbox` as POST /api/cron/drain-outbox and
 * admin.maintenance.drainOutbox, so the three cannot drift apart.
 *
 * This is the safety net, not the normal path. Checkout starts a drain in-process the
 * moment it has an answer to return, so a healthy request sends its mail seconds after
 * the response and this run finds nothing. What it exists for is the request that did
 * not: a container replaced mid-drain, a mailer that was down for an hour, a message
 * still working through its backoff.
 *
 * Safe to repeat and safe to overlap: a message is claimed with `for update skip locked`
 * and its attempt counted in the same statement, so two runs cannot both send it.
 *
 * Refuses to start without a mailer configured. A send with no RESEND_API_KEY is skipped
 * rather than failed, which the drain cannot tell from a delivery — it would mark every
 * pending invitation sent and mail nobody, once, unrecoverably.
 */
import { drainOutbox } from "@yacht-charter/api/services/outbox";
import { db } from "@yacht-charter/db";
import { env } from "@yacht-charter/env/server";

if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
  console.error(
    "RESEND_API_KEY and EMAIL_FROM are required here: without them every pending message is marked sent and nothing leaves",
  );
  process.exit(1);
}

const result = await drainOutbox(db);

console.log(JSON.stringify(result, null, 2));

// An idle pool client holds the event loop open. Harmless when a person runs this and
// walks away, fatal on a schedule: Railway reads a container that never exits as a run
// still in progress and skips every tick behind it.
await db.$client.end();

if (result.failed > 0) {
  console.error(
    `${result.failed} outbox message(s) ran out of attempts; each one is a mail a customer never received`,
  );
  process.exit(1);
}
