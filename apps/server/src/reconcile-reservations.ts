/**
 * The scheduled reconciliation pass, run from the deployed container — same pattern as
 * sweep-expiries.ts beside it.
 *
 * Asks each vendor what it changed since the last run and compares the answers to the
 * bookings we hold. It writes only the vendor's status word and the rotated security token;
 * a booking whose charter the operator cancelled is reported and left alone, because the
 * refund is a decision with money in it and this pass cannot know whether it was already made.
 *
 * Safe to repeat and safe to run late: the window overlaps the previous one, and re-reading a
 * change costs a comparison that finds nothing.
 *
 * Exits non-zero when a vendor's charter has drifted from ours. That is the whole point of the
 * run — a cancelled charter nobody has told the customer about — and a scheduler reporting
 * success is exactly where it would go unnoticed. A feed that was merely unreachable does not
 * fail the run: the cursor stays put and the next tick covers the same window.
 */
import { inventoryProvider } from "@yacht-charter/api/context";
import { reconcileReservations } from "@yacht-charter/api/services/reservation-reconcile";
import { db } from "@yacht-charter/db";
import { startJob } from "./job";

const job = startJob("reconcile-reservations");

const result = await reconcileReservations(db, inventoryProvider);

console.log(JSON.stringify(result, null, 2));

await db.$client.end();

const metrics = {
  watched: result.watched,
  reported: result.reported,
  matched: result.matched,
  tokensRefreshed: result.tokensRefreshed,
  statusesRecorded: result.statusesRecorded,
  drift: result.drift.length,
  cancelledByOperator: result.drift.filter((item) => item.kind === "cancelled_by_operator").length,
  unreachable: result.unreachable.length,
};

if (result.drift.length > 0) {
  console.error(
    `${result.drift.length} booking(s) no longer match the operator's own record: ` +
      result.drift.map((item) => `${item.reference} (${item.providerStatus})`).join(", "),
  );
  await job.failed("bookings drifted from the operator's record", metrics);
  process.exit(1);
}

await job.done(metrics);
