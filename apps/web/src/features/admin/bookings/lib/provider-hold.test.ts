import { describe, expect, it } from "vitest";

import { providerStillHolds } from "./provider-hold";

describe("providerStillHolds", () => {
  it("holds on the booking chain's canonical words", () => {
    expect(providerStillHolds("CANCELLED", "option_held")).toBe(true);
    expect(providerStillHolds("REFUND_PENDING", "confirmed")).toBe(true);
  });

  /* The reservation reconcile writes the vendor's own word over ours. */
  it("holds on the vendor words the reconcile writes", () => {
    expect(providerStillHolds("CANCELLED", "OPTION")).toBe(true);
    expect(providerStillHolds("REFUND_PENDING", "RESERVATION")).toBe(true);
    expect(providerStillHolds("CANCELLED", "OPTION_EXPIRED")).toBe(true);
  });

  it("does not hold once the vendor let it go, or was never asked", () => {
    expect(providerStillHolds("CANCELLED", "cancelled")).toBe(false);
    expect(providerStillHolds("CANCELLED", "CANCELLED")).toBe(false);
    expect(providerStillHolds("CANCELLED", "STORNO")).toBe(false);
    expect(providerStillHolds("CANCELLED", null)).toBe(false);
  });

  it("says nothing about a booking we still hold ourselves", () => {
    expect(providerStillHolds("CONFIRMED", "RESERVATION")).toBe(false);
    expect(providerStillHolds("OPTION_HELD", "OPTION")).toBe(false);
  });
});
