import { describe, expect, it } from "vitest";

import { DEAD_QUOTE_SWEEP, HOLD_SWEEP, canTransition } from "./booking-state";

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

describe("the two sweeps cannot both claim the same booking", () => {
  it("overlap only on OPTION_PENDING, which is separated by hold_expires_at", () => {
    const overlap = HOLD_SWEEP.from.filter((status) =>
      (DEAD_QUOTE_SWEEP.from as readonly string[]).includes(status),
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
