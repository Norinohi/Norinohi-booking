import { createHash } from "node:crypto";

import { listingView } from "@yacht-charter/db/schema/engagement";
import { lt } from "drizzle-orm";

import type { Database } from "../context";

/**
 * How long view rows are kept. Only the current day is ever read, but a few weeks
 * of history is what makes a trend answerable later without keeping the table
 * unbounded.
 */
const RETENTION_DAYS = 30;

/** UTC, because the read side counts `viewed_on = (now() at time zone 'utc')::date`. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Salts the visitor with the day before hashing, so two rows for the same person on
 * different dates cannot be linked back together. Storing the raw client id would
 * make this table a cross-day tracker for a number nobody needs that precision for.
 */
function dailyViewerKey(viewer: string, day: string): string {
  return createHash("sha256").update(`${day}:${viewer}`).digest("hex");
}

export type RecordListingViewInput = {
  listingId: string;
  /** The signed-in user id when there is one, else the browser's own anonymous id. */
  viewer: string;
};

/**
 * Records at most one view per viewer per listing per UTC day. A repeat view is a
 * no-op rather than an error: the browser fires this on every visit and has nothing
 * to do with a duplicate.
 *
 * An unknown listing id violates the foreign key. That is left to the caller to
 * translate, so a bad id is not silently counted.
 */
export async function recordListingView(
  db: Database,
  input: RecordListingViewInput,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDay(now);

  await db
    .insert(listingView)
    .values({
      listingId: input.listingId,
      viewedOn: day,
      viewerKey: dailyViewerKey(input.viewer, day),
    })
    .onConflictDoNothing();
}

/** Drops view rows past the retention window. Called from the maintenance cron. */
export async function pruneListingViews(
  db: Database,
  now: Date = new Date(),
): Promise<{ viewsPruned: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  // No `returning`: a prune can cover a lot of rows and the caller only reports a count.
  const result = await db.delete(listingView).where(lt(listingView.viewedOn, utcDay(cutoff)));

  return { viewsPruned: result.rowCount ?? 0 };
}
