import { SLOT_HOLDING_STATUSES, bookingStatus } from "@yacht-charter/db/schema/booking";
import { describe, expect, it } from "vitest";

import { HOLD_SWEEP, STALE_PAYMENT_SWEEP, type BookingStatus } from "./booking-state";

/*
 * `SLOT_HOLDING_STATUSES` is subtracted from cached availability on every dated search
 * (packages/db/src/search/slot-holds.ts), so a status in that list hides a yacht for as
 * long as a booking sits in it. That makes the list a claim about the state machine and
 * not just a filter: everything in it has to be something the machine moves on from.
 *
 * The failure this guards is silent and expensive. A status nothing sweeps would take a
 * boat out of search permanently on one abandoned checkout, and nothing about it would
 * look wrong -- the booking is fine, the sync is fine, the listing is simply never
 * returned. Which is why PAYMENT_FAILED is excluded: nothing sweeps it today.
 */

/** Statuses no sweep moves, kept out of search anyway. Each needs a reason on this list. */
const WATCHED_WITHOUT_A_SWEEP = [
  // Held across a single provider commit and reported by `flagStaleConfirmations` when it
  // is not. Money is with the provider, so blocking is right and being stuck is an incident.
  "CONFIRMING",
  // Sold. It stops holding dates when the charter is cancelled or refunded, not on a timer.
  "CONFIRMED",
] as const satisfies readonly BookingStatus[];

/** Nothing here holds a slot: either it never took one, or it has given it back. */
const RELEASED = [
  "DRAFT",
  "QUOTED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  // The vendor still holds this option and refuses the slot to anyone else, so the cost of
  // leaving it out is a bounce at checkout. The cost of putting it in is a listing hidden
  // for good, because no sweep moves PAYMENT_FAILED and only an admin can cancel it.
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
] as const satisfies readonly BookingStatus[];

/* Widened for `includes`, which otherwise refuses to be asked about a status outside its own list. */
const HOLDING: readonly BookingStatus[] = SLOT_HOLDING_STATUSES;
const WATCHED: readonly BookingStatus[] = WATCHED_WITHOUT_A_SWEEP;
const SWEPT_OUT: readonly BookingStatus[] = [...HOLD_SWEEP.from, ...STALE_PAYMENT_SWEEP.from];

describe("every status that hides dates can be left again", () => {
  it.each(SLOT_HOLDING_STATUSES)("%s is swept or watched", (status) => {
    const exits = SWEPT_OUT.includes(status) || WATCHED.includes(status);
    expect(exits).toBe(true);
  });

  it("never keeps blocking on a status a sweep moves a booking to", () => {
    const destinations = [HOLD_SWEEP.to, STALE_PAYMENT_SWEEP.to, STALE_PAYMENT_SWEEP.held];
    const stillBlocking = destinations.filter((status) => HOLDING.includes(status));

    expect(stillBlocking).toEqual([]);
  });
});

describe("the split covers the state machine", () => {
  it("classifies every booking status as holding or released", () => {
    const classified = new Set<string>([...SLOT_HOLDING_STATUSES, ...RELEASED]);
    const unclassified = bookingStatus.enumValues.filter((status) => !classified.has(status));

    expect(unclassified).toEqual([]);
  });

  it("puts no status on both sides", () => {
    const overlap = RELEASED.filter((status) => HOLDING.includes(status));

    expect(overlap).toEqual([]);
  });
});
