import { describe, expect, it } from "vitest";

import { detailDriftOf, driftKindOf } from "./reservation-drift";

/*
 * What counts as our record and the operator's having come apart. The pass writes nothing on
 * the strength of this — it reports — but what it reports is what somebody gets woken for, so
 * the line between "changed" and "drifted" is worth pinning.
 */
describe("driftKindOf", () => {
  it("names an operator cancellation apart from everything else", () => {
    expect(driftKindOf("CONFIRMED", "cancelled")).toBe("cancelled_by_operator");
  });

  /* Even a booking we had not confirmed yet: the customer is holding a charter nobody has. */
  it("names it on a hold too", () => {
    expect(driftKindOf("OPTION_HELD", "cancelled")).toBe("cancelled_by_operator");
  });

  /* Booking Manager: nobody cancelled it, and the vendor still blocks the week for it. */
  it("names a hold that ran out at the vendor apart from a cancellation", () => {
    expect(driftKindOf("OPTION_HELD", "cancelled", true)).toBe("option_lapsed");
    expect(driftKindOf("CONFIRMED", "cancelled", true)).toBe("option_lapsed");
  });

  it("flags a hold the operator confirmed behind our back", () => {
    expect(driftKindOf("OPTION_HELD", "confirmed")).toBe("status_drift");
  });

  it("flags a confirmed charter the operator has back on hold", () => {
    expect(driftKindOf("CONFIRMED", "option_held")).toBe("status_drift");
  });

  it("says nothing when the two agree", () => {
    expect(driftKindOf("CONFIRMED", "confirmed")).toBeNull();
    expect(driftKindOf("OPTION_HELD", "option_held")).toBeNull();
  });

  /*
   * A booking mid-flight through our own confirm is not drift: the vendor is answering about
   * the reservation we are in the middle of changing, and waking somebody for that is noise.
   */
  it("says nothing about a booking we are confirming right now", () => {
    expect(driftKindOf("CONFIRMING", "option_held")).toBeNull();
    expect(driftKindOf("CONFIRMING", "confirmed")).toBeNull();
  });
});

/*
 * An operator can move the week, swap the hull or reprice a charter without cancelling it. The
 * pass used to compare status alone, so none of those reached anybody.
 */
describe("detailDriftOf", () => {
  const sold = {
    checkIn: "2026-09-19",
    checkOut: "2026-09-26",
    externalYachtId: "74197399",
    priceMinor: 334_000,
    currency: "EUR",
  };
  const same = {
    status: "confirmed" as const,
    externalYachtId: "74197399",
    checkIn: "2026-09-19",
    checkOut: "2026-09-26",
    priceMinor: 334_000,
    currency: "EUR",
  };

  it("says nothing when the reservation is what we sold", () => {
    expect(detailDriftOf(sold, same)).toEqual([]);
  });

  it("names a moved week, a swapped hull and a new price", () => {
    const drift = detailDriftOf(sold, {
      ...same,
      checkIn: "2026-09-26",
      checkOut: "2026-10-03",
      externalYachtId: "74197400",
      priceMinor: 350_000,
    });

    expect(drift.map((item) => item.kind)).toEqual([
      "dates_changed",
      "yacht_changed",
      "price_changed",
    ]);
  });

  it("does not compare prices across currencies, or what the vendor did not state", () => {
    expect(detailDriftOf(sold, { ...same, priceMinor: 400_000, currency: "USD" })).toEqual([]);
    expect(detailDriftOf(sold, { status: "confirmed" })).toEqual([]);
    expect(detailDriftOf({ ...sold, priceMinor: null, externalYachtId: null }, same)).toEqual([]);
  });

  /* A cancellation is its own report; listing what else changed would bury it. */
  it("leaves a cancelled reservation to the cancellation", () => {
    expect(detailDriftOf(sold, { ...same, status: "cancelled", checkIn: "2027-01-01" })).toEqual(
      [],
    );
  });
});
