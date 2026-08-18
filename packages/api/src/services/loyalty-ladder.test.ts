import { describe, expect, it } from "vitest";

import {
  bonusPctFor,
  type LadderTier,
  MIN_BOOKING_FOR_CREDIT_MINOR,
  progressFor,
  rewardMinor,
  spendableFrom,
} from "./loyalty-ladder";

/** The seeded programme, in level order — the shape every caller passes. */
const TIERS: LadderTier[] = [
  { code: "sailor", name: "Sailor", level: 1, requiredBookings: 0, referralBonusPct: "0" },
  { code: "skipper", name: "Skipper", level: 2, requiredBookings: 3, referralBonusPct: "0.0250" },
  {
    code: "navigator",
    name: "Navigator",
    level: 3,
    requiredBookings: 10,
    referralBonusPct: "0.0500",
  },
];

const PERKS = [
  { code: "early-access", label: "Early access", tierLevel: 2 },
  { code: "bonus-credit", label: "5% extra credit", tierLevel: 3 },
];

describe("progressFor", () => {
  it("degrades to an empty progression when no tiers are seeded", () => {
    const progress = progressFor([], PERKS, 4);

    expect(progress.tier).toBeNull();
    expect(progress.nextTier).toBeNull();
    expect(progress.completedBookings).toBe(4);
    expect(progress.progressPct).toBe(0);
    expect(progress.perks).toEqual([]);
  });

  it("places someone with no referrals on the first tier rather than off the ladder", () => {
    const progress = progressFor(TIERS, PERKS, 0);

    expect(progress.tier?.code).toBe("sailor");
    expect(progress.nextTier?.code).toBe("skipper");
    expect(progress.remainingToNext).toBe(3);
    expect(progress.progressPct).toBe(0);
  });

  it("moves up on the booking that meets the threshold, not the one after it", () => {
    expect(progressFor(TIERS, PERKS, 2).tier?.code).toBe("sailor");
    expect(progressFor(TIERS, PERKS, 3).tier?.code).toBe("skipper");
  });

  it("measures the bar across the current tier's span, not from zero", () => {
    // Skipper at 3, Navigator at 10: six of the seven bookings between them.
    expect(progressFor(TIERS, PERKS, 9).progressPct).toBe(86);
  });

  it("reports the top tier as complete, with nothing left to reach", () => {
    const progress = progressFor(TIERS, PERKS, 12);

    expect(progress.tier?.code).toBe("navigator");
    expect(progress.nextTier).toBeNull();
    expect(progress.requiredForNext).toBeNull();
    expect(progress.remainingToNext).toBeNull();
    expect(progress.progressPct).toBe(100);
  });

  it("lists every perk in the programme, ticking the ones reached", () => {
    const progress = progressFor(TIERS, PERKS, 3);

    expect(progress.perks).toEqual([
      { code: "early-access", label: "Early access", unlocked: true },
      { code: "bonus-credit", label: "5% extra credit", unlocked: false },
    ]);
  });
});

describe("bonusPctFor", () => {
  it("pays nothing extra on the entry tier", () => {
    expect(bonusPctFor(TIERS, 1)).toBe(0);
  });

  it("reads the rate off the highest tier reached", () => {
    expect(bonusPctFor(TIERS, 3)).toBe(0.025);
    expect(bonusPctFor(TIERS, 10)).toBe(0.05);
  });

  it("pays nothing when the programme is unseeded", () => {
    expect(bonusPctFor([], 10)).toBe(0);
  });
});

describe("rewardMinor", () => {
  it("pays the base with no bonus", () => {
    expect(rewardMinor(10_000, 0)).toBe(10_000);
  });

  it("applies the tier bonus", () => {
    expect(rewardMinor(10_000, 0.05)).toBe(10_500);
  });

  it("rounds to whole minor units — money has no fractions", () => {
    expect(rewardMinor(9_999, 0.025)).toBe(10_249);
  });
});

describe("spendableFrom", () => {
  const OVER_MINIMUM = MIN_BOOKING_FOR_CREDIT_MINOR;

  it("spends nothing on a booking under the minimum", () => {
    expect(spendableFrom(50_000, MIN_BOOKING_FOR_CREDIT_MINOR - 1, 50_000)).toBe(0);
  });

  it("spends the whole balance when the bill can absorb it", () => {
    expect(spendableFrom(20_000, OVER_MINIMUM, 50_000)).toBe(20_000);
  });

  it("never spends more than is payable now, whatever the balance", () => {
    expect(spendableFrom(90_000, OVER_MINIMUM, 50_000)).toBe(50_000);
  });

  it("spends nothing when there is no balance", () => {
    expect(spendableFrom(0, OVER_MINIMUM, 50_000)).toBe(0);
  });

  /* A ledger that has been over-spent should not turn into a charge. */
  it("floors at zero on a negative balance", () => {
    expect(spendableFrom(-5_000, OVER_MINIMUM, 50_000)).toBe(0);
  });

  it("spends nothing when everything is payable at check-in", () => {
    expect(spendableFrom(20_000, OVER_MINIMUM, 0)).toBe(0);
  });
});
