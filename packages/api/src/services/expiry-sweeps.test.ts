import { describe, expect, it } from "vitest";

import { DEAD_QUOTE_SWEEP, HOLD_SWEEP, STALE_PAYMENT_SWEEP, canTransition } from "./booking-state";

/*
 * The sweeper picks its candidates with a SQL status filter and then writes a
 * fixed status, which makes the pairing invisible to the type checker. That is
 * how OPTION_PENDING came to be swept to QUOTE_EXPIRED while the §6 table
 * forbade the edge: both halves were individually reasonable.
 *
 * Anything that expands a sweep's `from` list now has to answer to the table.
 */

const SWEEPS = [
  { name: "expireHolds", sweep: HOLD_SWEEP },
  { name: "expireBookingsWithDeadQuotes", sweep: DEAD_QUOTE_SWEEP },
  { name: "expireAbandonedPayments", sweep: STALE_PAYMENT_SWEEP },
  // Its second destination, chosen per booking by whether an option was ever held. Listed
  // separately because `to` is the only half the checks below look at.
  {
    name: "expireAbandonedPayments (held)",
    sweep: { from: STALE_PAYMENT_SWEEP.from, to: STALE_PAYMENT_SWEEP.held },
  },
];

describe("every sweep writes a status the state machine allows", () => {
  it.each(SWEEPS)("$name", ({ sweep }) => {
    const illegal = sweep.from.filter((from) => !canTransition(from, sweep.to));
    expect(illegal).toEqual([]);
  });

  it.each(SWEEPS)("$name sweeps at least one status", ({ sweep }) => {
    expect(sweep.from.length).toBeGreaterThan(0);
  });
});

describe("no two sweeps can both claim the same booking", () => {
  it("leaves PAYMENT_PENDING to the payment sweep alone", () => {
    // The other two exclude it deliberately: money may be in flight and the Stripe webhook
    // is the authority. `expireAbandonedPayments` is the only thing allowed to give up on it,
    // and only long after any payment could still land.
    expect(HOLD_SWEEP.from).not.toContain("PAYMENT_PENDING");
    expect(DEAD_QUOTE_SWEEP.from).not.toContain("PAYMENT_PENDING");
    expect(STALE_PAYMENT_SWEEP.from).toEqual(["PAYMENT_PENDING"]);
  });

  it("overlap only on OPTION_PENDING, which is separated by hold_expires_at", () => {
    const overlap = HOLD_SWEEP.from.filter((status) =>
      DEAD_QUOTE_SWEEP.from.some((other) => other === status),
    );

    // expireHolds additionally requires hold_expires_at IS NOT NULL, and that
    // column is only written on the move to OPTION_HELD — so an OPTION_PENDING
    // booking is unreachable from that sweep and only the quote path sees it.
    expect(overlap).toEqual(["OPTION_PENDING"]);
  });
});

describe("the states a sweep produces are recoverable", () => {
  it.each(SWEEPS)("$name leaves the customer able to reprice", ({ sweep }) => {
    // Both expiry states exist so an abandoned checkout can be picked back up;
    // neither may be terminal.
    expect(canTransition(sweep.to, "QUOTED")).toBe(true);
    expect(canTransition(sweep.to, "CANCELLED")).toBe(true);
  });
});

/*
 * CONFIRMING is the one stuck state the sweep reports without resolving. A booking
 * reaches it only after the money is in, and it is claimed before the provider
 * commit, so a stranded one may or may not have a real reservation behind it.
 * `flagStaleConfirmations` therefore writes an audit event and leaves the status
 * alone; these guard the reasoning rather than the query.
 */
describe("stale CONFIRMING bookings are never swept automatically", () => {
  it.each(SWEEPS)("$name does not claim CONFIRMING", ({ sweep }) => {
    // Adding it to either `from` list would expire a booking the customer has
    // already paid for, releasing the slot while we still hold their money.
    expect(sweep.from).not.toContain("CONFIRMING");
  });

  it("offers only outcomes that are guesses, which is why the sweep makes none", () => {
    // Both are reachable, and picking either without asking the provider is wrong:
    // CONFIRMED invents a charter, PROVIDER_REJECTED refunds one that may exist.
    expect(canTransition("CONFIRMING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMING", "PROVIDER_REJECTED")).toBe(true);
    // No escape that reprices, so a human has to resolve it either way.
    expect(canTransition("CONFIRMING", "QUOTED")).toBe(false);
    expect(canTransition("CONFIRMING", "CANCELLED")).toBe(false);
  });
});

/*
 * The two destinations of the payment sweep are not interchangeable: each one is a claim
 * about what lapsed, and a booking that never held an option cannot have had one expire.
 */
describe("the payment sweep names what actually lapsed", () => {
  it("expires the option only where one was held", () => {
    expect(STALE_PAYMENT_SWEEP.held).toBe("OPTION_EXPIRED");
    expect(STALE_PAYMENT_SWEEP.to).toBe("QUOTE_EXPIRED");
  });

  it("releases the slot either way", () => {
    // Both destinations sit outside booking_provider_option_uq's partial predicate, which is
    // the entire point: an abandoned checkout used to hold that option against every future
    // booking of the same week.
    const RELEASED = [
      "CANCELLED",
      "REFUNDED",
      "OPTION_EXPIRED",
      "QUOTE_EXPIRED",
      "PROVIDER_REJECTED",
    ];
    expect(RELEASED).toContain(STALE_PAYMENT_SWEEP.to);
    expect(RELEASED).toContain(STALE_PAYMENT_SWEEP.held);
  });
});
