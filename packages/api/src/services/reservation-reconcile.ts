import { booking } from "@yacht-charter/db/schema/booking";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { readSyncCursor, writeSyncCursor } from "@yacht-charter/providers/sync/cursor";
import type { InventoryProvider, ProviderReservationState } from "@yacht-charter/providers";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../context";
import { driftKindOf, type DriftKind } from "../lib/reservation-drift";
import { providerByKey } from "./provider-routing";
import type { BookingStatus } from "./booking-state";

/**
 * What the operator has done to our reservations since we last looked.
 *
 * Nothing here ever re-read one. The booking chain writes our copy at the moment we act --
 * option, confirm, cancel -- and then the record stands still, while the operator goes on
 * working in their own system: a charter they cancel, a boat they swap, a week they move. The
 * first we would hear of it is the customer arriving at the base.
 *
 * NauSYS publishes no webhook and no event stream. What it does publish is a reservation list
 * filtered by modify time, so this pass asks "what changed since the last run" and compares
 * the answers to our own rows.
 *
 * It writes exactly two things: the vendor's status word onto `booking.provider_status`, and
 * the rotated security token, without which every later call on that reservation fails. It
 * does NOT move a booking's own status. A charter the operator cancelled is money in a
 * customer's hands and a refund somebody has to decide on, and this pass has no idea whether
 * that already happened -- so it reports, loudly, and leaves the decision where it belongs.
 * `flagStaleConfirmations` in the expiry sweep takes the same line for the same reason.
 */

/** Bookings worth asking about: still live, and known to the vendor. */
const OPEN: readonly BookingStatus[] = [
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "CONFIRMING",
  "CONFIRMED",
];

/**
 * How far back the first run looks, and the overlap every later one keeps.
 *
 * The vendor states its window in its own wall clock and we send ours converted, so an hour
 * lost to a daylight-saving edge would be an hour of changes nobody ever sees. Re-reading a
 * change twice costs one comparison that finds nothing.
 */
const OVERLAP_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_MS = 7 * 24 * 60 * 60 * 1000;

const cursorSchema = z.object({ lastRunAt: z.iso.datetime() });

export type ReservationDrift = {
  bookingId: string;
  reference: string;
  providerReservationId: string;
  /** Our booking's status, in our words. */
  status: BookingStatus;
  /** Theirs, in theirs. */
  providerStatus: string;
  kind: DriftKind;
};

export interface ReconcileResult {
  /** Bookings we hold that the vendor could have spoken about. */
  watched: number;
  /** Reservations the vendor reported as changed inside the window. */
  reported: number;
  /** Of those, ones that are ours. */
  matched: number;
  tokensRefreshed: number;
  statusesRecorded: number;
  drift: ReservationDrift[];
  /** Providers that could not answer, by code; the window stays open for the next run. */
  unreachable: string[];
}

export async function reconcileReservations(
  db: Database,
  fallback: InventoryProvider,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const ours = await db
    .select({
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      provider: booking.provider,
      providerReservationId: booking.providerReservationId,
      providerReservationUuid: booking.providerReservationUuid,
      providerStatus: booking.providerStatus,
    })
    .from(booking)
    .where(and(inArray(booking.status, OPEN), isNotNull(booking.providerReservationId)));

  const result: ReconcileResult = {
    watched: ours.length,
    reported: 0,
    matched: 0,
    tokensRefreshed: 0,
    statusesRecorded: 0,
    drift: [],
    unreachable: [],
  };
  if (ours.length === 0) return result;

  /* One call per vendor rather than per booking: the feed is a window, not a lookup. */
  for (const code of new Set(ours.map((row) => row.provider))) {
    const adapter = await providerByKey(fallback, code);
    if (!adapter.listChangedReservations) continue;

    const key = {
      providerId: await providerIdOf(db, code),
      kind: "reservations" as const,
      scope: "default",
    };
    const since = await windowStart(db, key, now);

    let changed: ProviderReservationState[];
    try {
      changed = await adapter.listChangedReservations({ since, until: now });
    } catch (error) {
      /* The cursor is deliberately not advanced: the window this run missed is the next
         run's to cover, and a feed that is down must not quietly skip a day of changes. */
      console.error(
        `[reconcile] ${code} change feed unavailable`,
        error instanceof Error ? error.message : error,
      );
      result.unreachable.push(code);
      continue;
    }

    result.reported += changed.length;
    const mine = new Map(
      ours.filter((row) => row.provider === code).map((row) => [row.providerReservationId, row]),
    );

    for (const state of changed) {
      const row = mine.get(state.providerReservationId);
      if (!row) continue;
      result.matched += 1;

      const changes: Partial<typeof booking.$inferInsert> = {};
      if (state.providerStatus !== row.providerStatus) {
        changes.providerStatus = state.providerStatus;
        result.statusesRecorded += 1;
      }
      /* The uuid rotates on the operator's writes too, and ours is then dead: every later
         call on the reservation -- a cancellation, a crew list -- would be refused. */
      if (state.securityToken && state.securityToken !== row.providerReservationUuid) {
        changes.providerReservationUuid = state.securityToken;
        result.tokensRefreshed += 1;
      }

      if (Object.keys(changes).length > 0) {
        await db.update(booking).set(changes).where(eq(booking.id, row.id));
      }

      const kind = driftKindOf(row.status, state.status);
      if (kind) {
        result.drift.push({
          bookingId: row.id,
          reference: row.reference,
          providerReservationId: state.providerReservationId,
          status: row.status,
          providerStatus: state.providerStatus,
          kind,
        });
      }
    }

    if (!result.unreachable.includes(code)) {
      await writeSyncCursor(db, key, { lastRunAt: now.toISOString() });
    }
  }

  return result;
}

async function windowStart(
  db: Database,
  key: { providerId: string; kind: "reservations"; scope: string },
  now: Date,
): Promise<Date> {
  const stored = cursorSchema.safeParse(await readSyncCursor(db, key));
  if (!stored.success) return new Date(now.getTime() - FIRST_RUN_MS);

  return new Date(Date.parse(stored.data.lastRunAt) - OVERLAP_MS);
}

async function providerIdOf(db: Database, code: string): Promise<string> {
  const [row] = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, code))
    .limit(1);

  if (!row) throw new Error(`No provider row for ${code}; the cursor has nowhere to live`);
  return row.id;
}
