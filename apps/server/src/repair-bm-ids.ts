/**
 * One-off repair of Booking Manager ids stored before responses were parsed without
 * rounding. Run by hand from the deployed container, once, before the first catalogue
 * sync on the new parser - see `packages/providers/src/booking-manager/repair-ids.ts`
 * for what was wrong and why the mapping is recoverable.
 *
 * Defaults to a dry run. Pass `--apply` to write, mirroring `db:baseline`.
 */
import { db } from "@yacht-charter/db";
import { repairBookingManagerIds } from "@yacht-charter/providers/booking-manager/repair-ids";

const apply = process.argv.includes("--apply");

try {
  const report = await repairBookingManagerIds({ db, dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
  }
} catch (error) {
  console.error("Booking Manager id repair failed:", error);
  await db.$client.end();
  process.exit(1);
}

// See sync-catalogue.ts: an idle pool client holds the event loop open.
await db.$client.end();
