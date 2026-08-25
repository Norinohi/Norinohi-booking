/**
 * The scheduled expiry sweep, run from the deployed container — same pattern as
 * sync-catalogue.ts and sync-availability.ts. Calls the same `sweepExpiries` as
 * POST /api/cron/sweep-expiries and admin.maintenance.sweepExpiries, with the
 * same process-wide adapter, so the three cannot drift apart. The HTTP route
 * stays as the manual escape hatch for clearing a stuck hold between runs.
 *
 * Safe to repeat and safe to overlap: every write is a compare-and-set on the
 * status that was read (see packages/api/src/services/expiry.ts).
 *
 * Exits non-zero when a provider release failed. Our side of the booking expired
 * either way, but the vendor is still holding that option, and a scheduler
 * reporting success is exactly where that would go unnoticed. Stale confirmations
 * are printed without failing the run: expiry.ts reports rather than moves them
 * precisely because guessing either way is wrong.
 */
import { inventoryProvider } from "@yacht-charter/api/context";
import { sweepExpiries } from "@yacht-charter/api/services/expiry";
import { db } from "@yacht-charter/db";
import { startJob } from "./job";

const job = startJob("sweep-expiries");

const result = await sweepExpiries(db, inventoryProvider);

console.log(JSON.stringify(result, null, 2));

await db.$client.end();

const metrics = {
  quotesExpired: result.quotesExpired,
  holdsExpired: result.holdsExpired,
  paymentsAbandoned: result.paymentsAbandoned,
  syncRunsReaped: result.syncRunsReaped,
  staleConfirmations: result.staleConfirmations.length,
  releaseFailures: result.releaseFailures.length,
};

if (result.releaseFailures.length > 0) {
  console.error(
    `${result.releaseFailures.length} provider option release(s) failed; the vendor is still holding them`,
  );
  await job.failed("provider option releases failed", metrics);
  process.exit(1);
}

await job.done(metrics);
