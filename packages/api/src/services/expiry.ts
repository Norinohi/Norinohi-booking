import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { IN_FLIGHT_SYNC_STATUSES, syncError, syncRun } from "@yacht-charter/db/schema/provider";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { Database } from "../context";
import { DEAD_QUOTE_SWEEP, HOLD_SWEEP, assertTransition } from "./booking-state";
import { pruneListingViews } from "./listing-view";

export type SweepResult = {
  quotesExpired: number;
  holdsExpired: number;
  bookingsQuoteExpired: number;
  /** Provider releases that failed. The booking still expires; this is for ops. */
  releaseFailures: { bookingId: string; message: string }[];
  /** View rows dropped past their retention window — unrelated to expiry, but the
   *  same scheduled call is the only maintenance tick this service has. */
  viewsPruned: number;
  /** Sync runs abandoned by a process that died, moved to `failed`. */
  syncRunsReaped: number;
};

/**
 * The expiry sweeper from docs/backend-architecture.md §6.1 step 5.
 *
 * Without this nothing ever leaves OPTION_HELD on its own: the provider option
 * index is unique over live bookings, so a single abandoned checkout would keep
 * that slot unbookable forever. Quotes also only expired lazily, when something
 * happened to read them.
 *
 * Abandoned sync runs are reaped here for the same reason and not because they are
 * expiries: `sync_run_in_flight_uq` is the other unique index over live rows, and a
 * run whose process died holds it against every future sync of that provider.
 *
 * Safe to run concurrently and on a schedule — every write is a compare-and-set on
 * the status that was read, so two overlapping runs cannot double-apply, and a
 * webhook that moved a booking first simply wins.
 */
export async function sweepExpiries(
  db: Database,
  provider: InventoryProvider,
  now: Date = new Date(),
): Promise<SweepResult> {
  const quotesExpired = await expireQuotes(db, now);
  const { holdsExpired, releaseFailures } = await expireHolds(db, now, provider);
  const bookingsQuoteExpired = await expireBookingsWithDeadQuotes(db, now);
  const { viewsPruned } = await pruneListingViews(db, now);
  const syncRunsReaped = await reapAbandonedSyncRuns(db, now);

  return {
    quotesExpired,
    holdsExpired,
    bookingsQuoteExpired,
    releaseFailures,
    viewsPruned,
    syncRunsReaped,
  };
}

/**
 * How long a run may sit in flight before the sweep decides its process is gone.
 *
 * Generous on purpose: a full catalogue walk over a large fleet is slow, and reaping a
 * run that is still working would let a second one start against the same cursor —
 * exactly what `sync_run_in_flight_uq` exists to prevent. Six hours is far longer than
 * any observed run and far shorter than the "never" we had before.
 */
const ABANDONED_SYNC_RUN_MS = 6 * 60 * 60 * 1000;

/**
 * Sync runs whose process died mid-walk.
 *
 * `pending` and `running` are only ever left behind by the process doing the work — it
 * writes the terminal status itself — so a redeploy, an OOM or a restart strands the row
 * with nobody to close it. That used to be untidy history. Since the in-flight unique
 * index it is a deadlock: the stranded row holds the lock for that provider and kind, and
 * every later sync is refused at the insert, quietly, for as long as the row sits there.
 *
 * The failure is recorded as a `transient` sync_error rather than only a status, because
 * a run that ends with no explanation is indistinguishable from one that failed on the
 * vendor's side, and the two want different responses from whoever reads the history.
 */
async function reapAbandonedSyncRuns(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_SYNC_RUN_MS);

  const reaped = await db
    .update(syncRun)
    .set({ status: "failed", finishedAt: now })
    .where(
      and(
        // The index's own definition of in-flight, so the lock and its release agree.
        inArray(syncRun.status, [...IN_FLIGHT_SYNC_STATUSES]),
        // `started_at` is written on the move to running, so a run that died while still
        // pending has none; it is aged from when it was created instead.
        lte(sql`coalesce(${syncRun.startedAt}, ${syncRun.createdAt})`, cutoff),
      ),
    )
    .returning({ id: syncRun.id });

  if (reaped.length > 0) {
    await db.insert(syncError).values(
      reaped.map((row) => ({
        syncRunId: row.id,
        errorType: "transient" as const,
        message: "Abandoned mid-run: no process claimed it before the sweep's cutoff",
        context: { reapedAt: now.toISOString(), cutoff: cutoff.toISOString() },
      })),
    );
  }

  return reaped.length;
}

/** Active quotes past their expiry. Consumed ones belong to a booking and are left alone. */
async function expireQuotes(db: Database, now: Date): Promise<number> {
  const rows = await db
    .update(quote)
    .set({ status: "expired" })
    .where(and(eq(quote.status, "active"), lte(quote.expiresAt, now)))
    .returning({ id: quote.id });

  return rows.length;
}

/**
 * Bookings whose provider hold has lapsed. The option is released best-effort:
 * `hold_expires_at` has already passed, so a provider that owns its own expiry has
 * dropped it regardless, and a failed release must not leave the booking stuck in a
 * state nothing else can clear.
 */
async function expireHolds(
  db: Database,
  now: Date,
  provider: InventoryProvider,
): Promise<{ holdsExpired: number; releaseFailures: SweepResult["releaseFailures"] }> {
  const candidates = await db
    .select({
      id: booking.id,
      status: booking.status,
      providerName: booking.provider,
      providerOptionId: booking.providerOptionId,
      providerReservationId: booking.providerReservationId,
      providerReservationUuid: booking.providerReservationUuid,
    })
    .from(booking)
    .where(
      and(
        inArray(booking.status, [...HOLD_SWEEP.from]),
        isNotNull(booking.holdExpiresAt),
        lte(booking.holdExpiresAt, now),
      ),
    );

  const releaseFailures: SweepResult["releaseFailures"] = [];
  let holdsExpired = 0;

  for (const candidate of candidates) {
    let releaseError: string | null = null;

    if (candidate.providerOptionId) {
      try {
        await provider.cancelOption({
          providerReservationId: candidate.providerReservationId ?? candidate.providerOptionId,
          securityToken: candidate.providerReservationUuid ?? undefined,
        });
      } catch (error) {
        releaseError = error instanceof Error ? error.message : String(error);
        releaseFailures.push({ bookingId: candidate.id, message: releaseError });
      }
    }

    assertTransition(candidate.status, HOLD_SWEEP.to);

    const [updated] = await db
      .update(booking)
      .set({ status: HOLD_SWEEP.to })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    // Something else moved it between the read and the write; leave it alone.
    if (!updated) continue;

    holdsExpired += 1;

    await db.insert(providerReservationEvent).values({
      bookingId: candidate.id,
      kind: "option_released",
      provider: candidate.providerName,
      providerReference: candidate.providerOptionId,
      payload: releaseError ? { released: false, error: releaseError } : { released: true },
    });
  }

  return { holdsExpired, releaseFailures };
}

/**
 * Bookings still waiting on a quote that has run out. This is the only expiry path
 * for a provider with no option support, where createHold leaves the booking at
 * QUOTED with no hold to lapse.
 *
 * PAYMENT_PENDING is deliberately excluded: money may be in flight, and the Stripe
 * webhook is the authority on how that ends.
 */
async function expireBookingsWithDeadQuotes(db: Database, now: Date): Promise<number> {
  const candidates = await db
    .select({ id: booking.id, status: booking.status })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(and(inArray(booking.status, [...DEAD_QUOTE_SWEEP.from]), lte(quote.expiresAt, now)));

  let expired = 0;

  for (const candidate of candidates) {
    assertTransition(candidate.status, DEAD_QUOTE_SWEEP.to);

    const [updated] = await db
      .update(booking)
      .set({ status: DEAD_QUOTE_SWEEP.to })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    if (updated) expired += 1;
  }

  return expired;
}
