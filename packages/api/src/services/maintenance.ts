import type { Database } from "../context";
import { writeAuditLog } from "./audit";

/**
 * Runs one maintenance job and records who asked for it.
 *
 * The jobs themselves are shared with the cron routes, which have no actor to attribute, so the
 * entry is written here rather than inside the service. Without it a hand-run sweep moves real
 * bookings and leaves the history claiming nobody touched them — the one thing §5.7 says the log
 * must never do.
 */
export async function runMaintenance<Result>(
  db: Database,
  actorUserId: string,
  job: "sweep_expiries" | "payment_reminders" | "drain_outbox",
  run: () => Promise<Result>,
): Promise<Result> {
  const result = await run();
  await writeAuditLog(db, {
    actorUserId,
    action: "update",
    entityType: "maintenance",
    entityId: job,
    after: result,
  });
  return result;
}
