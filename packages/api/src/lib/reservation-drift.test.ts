import { describe, expect, it } from "vitest";

import { driftKindOf } from "./reservation-drift";

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
