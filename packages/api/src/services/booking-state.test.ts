import { describe, expect, it } from "vitest";

import {
  BOOKING_RECEIVED_STATES,
  DEAD_QUOTE_SWEEP,
  HOLD_SWEEP,
  STALE_PAYMENT_SWEEP,
  type BookingStatus,
  InvalidTransitionError,
  assertTransition,
  canTransition,
  isPreConfirmed,
  isUserCancellable,
} from "./booking-state";

/*
 * Characterization, not specification: this is the §6 table as it behaves today,
 * spelled out independently of the implementation so that rewiring a call site
 * into assertTransition cannot quietly move a rule at the same time.
 *
 * Five status writes currently bypass this module (booking-confirm, expiry,
 * invoice). Routing them through it is a behaviour change — some writes that
 * pass silently today become conflicts — so it is deliberately out of scope
 * until this table is pinned.
 */

const ALL: readonly BookingStatus[] = [
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
];

const ALLOWED = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["OPTION_PENDING", "PAYMENT_PENDING", "QUOTE_EXPIRED", "CANCELLED"],
  OPTION_PENDING: [
    "OPTION_HELD",
    "OPTION_EXPIRED",
    "QUOTE_EXPIRED",
    "PROVIDER_REJECTED",
    "CANCELLED",
  ],
  OPTION_HELD: ["PAYMENT_PENDING", "OPTION_EXPIRED", "CANCELLED"],
  PAYMENT_PENDING: ["CONFIRMING", "PAYMENT_FAILED", "QUOTE_EXPIRED", "OPTION_EXPIRED", "CANCELLED"],
  CONFIRMING: ["CONFIRMED", "PROVIDER_REJECTED"],
  CONFIRMED: ["REFUND_PENDING", "CANCELLED"],
  QUOTE_EXPIRED: ["QUOTED", "CANCELLED"],
  OPTION_EXPIRED: ["QUOTED", "CANCELLED"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "CANCELLED"],
  PROVIDER_REJECTED: ["REFUND_PENDING", "CANCELLED"],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
} satisfies Record<BookingStatus, readonly BookingStatus[]>;

const PRE_CONFIRMED: readonly BookingStatus[] = [
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
];

describe("canTransition", () => {
  it("covers every status in the union", () => {
    expect(ALL).toHaveLength(14);
    expect(Object.keys(ALLOWED).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)("matches the §6 table for every target from %s", (from) => {
    const actual = ALL.filter((to) => canTransition(from, to));
    expect([...actual].sort()).toEqual([...ALLOWED[from]].sort());
  });

  it("has no self-transitions", () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(false);
  });

  it("treats CANCELLED and REFUNDED as terminal", () => {
    for (const to of ALL) {
      expect(canTransition("CANCELLED", to)).toBe(false);
      expect(canTransition("REFUNDED", to)).toBe(false);
    }
  });

  it("lets every non-terminal status reach CANCELLED except the two commit points", () => {
    // CONFIRMING and REFUND_PENDING are mid-flight with the provider or the PSP,
    // so they resolve forward rather than being cancelled from under it.
    const notCancellable = ALL.filter((from) => !canTransition(from, "CANCELLED"));
    expect([...notCancellable].sort()).toEqual([
      "CANCELLED",
      "CONFIRMING",
      "REFUNDED",
      "REFUND_PENDING",
    ]);
  });
});

describe("isPreConfirmed / isUserCancellable", () => {
  it.each(ALL)("classifies %s", (status) => {
    expect(isPreConfirmed(status)).toBe(PRE_CONFIRMED.includes(status));
  });

  it("is currently the same predicate as isUserCancellable", () => {
    for (const status of ALL) expect(isUserCancellable(status)).toBe(isPreConfirmed(status));
  });

  it("excludes CONFIRMED, so a confirmed booking needs the admin refund branch", () => {
    expect(isUserCancellable("CONFIRMED")).toBe(false);
    expect(canTransition("CONFIRMED", "REFUND_PENDING")).toBe(true);
  });
});

describe("assertTransition", () => {
  it("passes for every allowed edge", () => {
    for (const from of ALL) {
      for (const to of ALLOWED[from]) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it("throws InvalidTransitionError carrying both ends", () => {
    try {
      assertTransition("CONFIRMED", "QUOTED");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      if (!(error instanceof InvalidTransitionError)) throw error;
      expect(error.from).toBe("CONFIRMED");
      expect(error.to).toBe("QUOTED");
      expect(error.name).toBe("InvalidTransitionError");
      expect(error.message).toBe("Cannot move a booking from CONFIRMED to QUOTED");
    }
  });

  it("is a plain Error, so callers must map it to a status code themselves", () => {
    // checkout.ts and payment.ts call assertTransition bare, so this surfaces as
    // a 500 there while booking.ts catches it and returns 409.
    const error = new InvalidTransitionError("CANCELLED", "CONFIRMED");
    expect(error).toBeInstanceOf(Error);
  });
});

/*
 * `BOOKING_RECEIVED_STATES` decides whether a queued "we're holding your yacht" mail is still
 * worth sending when the drain finally gets to it. It is a claim about the table above, so it
 * answers to the table: a state that can no longer reach CONFIRMED is a booking nobody is
 * holding, and telling that customer to complete their payment is the one thing the guard exists
 * to prevent.
 */
describe("the states the booking-received mail is true of", () => {
  const reaches = (from: BookingStatus, goal: BookingStatus): boolean => {
    const seen = new Set<BookingStatus>([from]);
    const queue: BookingStatus[] = [from];

    while (queue.length > 0) {
      const at = queue.shift();
      if (at === undefined) break;
      if (at === goal) return true;

      for (const next of ALL) {
        if (!seen.has(next) && canTransition(at, next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }

    return false;
  };

  it.each([...BOOKING_RECEIVED_STATES])("%s can still become a charter", (status) => {
    expect(reaches(status, "CONFIRMED")).toBe(true);
  });

  it("excludes every state that cannot", () => {
    const stale = ALL.filter((status) => !reaches(status, "CONFIRMED"));
    const listed: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;

    expect(stale).not.toEqual([]);
    expect(stale.filter((status) => listed.includes(status))).toEqual([]);
  });

  it("covers both states createHold can leave a booking in", () => {
    const listed: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;

    // QUOTED for a provider that grants no option, OPTION_HELD for one that does. Dropping
    // either would stop the mail going out on the ordinary path, not just on a retry.
    expect(listed).toContain("QUOTED");
    expect(listed).toContain("OPTION_HELD");
  });

  it("excludes a charter that is already confirmed", () => {
    const listed: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;

    // Both can still reach CONFIRMED, so the reachability test cannot catch them.
    expect(listed).not.toContain("CONFIRMED");
    expect(listed).not.toContain("CONFIRMING");
  });

  it("excludes everything the expiry sweeps produce", () => {
    const listed: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;
    /*
     * An expired booking can be repriced back to QUOTED and go on to be confirmed, so
     * reachability says nothing about it. What matters is that its hold is gone: the mail
     * names a date the operator is holding the slot until, and after a sweep there is none.
     */
    const swept: readonly BookingStatus[] = [
      HOLD_SWEEP.to,
      DEAD_QUOTE_SWEEP.to,
      STALE_PAYMENT_SWEEP.to,
      STALE_PAYMENT_SWEEP.held,
    ];

    expect(swept.filter((status) => listed.includes(status))).toEqual([]);
  });
});
