import { describe, expect, it } from "vitest";

import {
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
