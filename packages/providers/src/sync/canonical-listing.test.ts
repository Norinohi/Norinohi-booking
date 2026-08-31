import { describe, expect, it } from "vitest";

import { countStated, type OfferFieldCandidate, resolveFields } from "./canonical-listing";

const bookingManager: OfferFieldCandidate = {
  offerId: "loff_bm",
  providerCode: "booking_manager",
  completeness: { title: 1, spec: 4, media: 2, description: 1 },
};

const nausys: OfferFieldCandidate = {
  offerId: "loff_ns",
  providerCode: "nausys",
  completeness: { title: 1, spec: 12, media: 30, description: 1 },
};

describe("resolveFields", () => {
  it("has nothing to say about a listing with no offers", () => {
    expect(resolveFields([]).size).toBe(0);
  });

  it("gives every group to the only offer there is", () => {
    const winners = resolveFields([nausys]);
    expect(winners.get("spec")).toBe("loff_ns");
    expect(winners.get("media")).toBe("loff_ns");
    expect(winners.get("title")).toBe("loff_ns");
  });

  it("takes the fuller record for the specs", () => {
    expect(resolveFields([bookingManager, nausys]).get("spec")).toBe("loff_ns");
  });

  it("takes Booking Manager's photos even where NauSYS sent more of them", () => {
    // The stated rule in the architecture doc is about quality, not quantity, so this is
    // the one group where completeness does not decide.
    expect(resolveFields([bookingManager, nausys]).get("media")).toBe("loff_bm");
  });

  it("falls to the provider preference when both records say as much", () => {
    expect(resolveFields([nausys, bookingManager]).get("title")).toBe("loff_bm");
  });

  it("honours a locked override against every other rule", () => {
    const overrides = new Map([
      ["media", "loff_ns"],
      ["spec", "loff_bm"],
    ] as const);
    const winners = resolveFields([bookingManager, nausys], overrides);
    expect(winners.get("media")).toBe("loff_ns");
    expect(winners.get("spec")).toBe("loff_bm");
  });

  it("ignores an override naming an offer this listing no longer has", () => {
    // The offer was retired or split away. Freezing the listing on a vendor that no longer
    // sells it is worse than falling back to the rules.
    const winners = resolveFields([nausys], new Map([["spec", "loff_bm"]]));
    expect(winners.get("spec")).toBe("loff_ns");
  });

  it("resolves the same way whatever order the offers arrive in", () => {
    const forwards = resolveFields([bookingManager, nausys]);
    const backwards = resolveFields([nausys, bookingManager]);
    expect([...forwards]).toEqual([...backwards]);
  });

  it("breaks a dead tie on the offer id rather than on input order", () => {
    const twin = { ...nausys, offerId: "loff_aa", completeness: bookingManager.completeness };
    const winners = resolveFields([
      { ...bookingManager, providerCode: "nausys", offerId: "loff_zz" },
      twin,
    ]);
    expect(winners.get("spec")).toBe("loff_aa");
  });

  it("sorts a provider the preference does not name after every one it does", () => {
    const stranger: OfferFieldCandidate = {
      offerId: "loff_aa",
      providerCode: "some_new_vendor",
      completeness: bookingManager.completeness,
    };
    expect(resolveFields([stranger, bookingManager]).get("title")).toBe("loff_bm");
  });
});

describe("countStated", () => {
  it("counts what the provider filled in", () => {
    expect(countStated([1, "a", true])).toBe(3);
  });

  it("reads null and undefined alike as silence", () => {
    expect(countStated([null, undefined, 1])).toBe(1);
  });

  it("counts a blank string, because saying nothing is not the same as saying it is empty", () => {
    expect(countStated(["", 0, false])).toBe(3);
  });
});
