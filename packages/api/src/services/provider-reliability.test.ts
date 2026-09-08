import { describe, expect, it } from "vitest";

import { type ProviderCounts, rankableRates, reliabilityOf } from "./provider-reliability";

const counts = (over: Partial<ProviderCounts> = {}): ProviderCounts => ({
  provider: "nausys",
  answered: 0,
  failed: 0,
  ineligible: 0,
  p50LatencyMs: null,
  ...over,
});

describe("reliabilityOf", () => {
  it("scores a vendor on what it answered against what it failed to", () => {
    const row = reliabilityOf(counts({ answered: 90, failed: 10 }));
    expect(row.successRatio).toBe(0.9);
  });

  it("counts a refusal as an answer, since the vendor was reached", () => {
    /* `answered` already folds won, lost and unavailable together; the point of the case is
       that a period the vendor said was gone must not read as a connector that broke. */
    expect(reliabilityOf(counts({ answered: 5, failed: 0 })).successRatio).toBe(1);
  });

  it("keeps our own cache's refusals out of the rate but inside the ask count", () => {
    const row = reliabilityOf(counts({ answered: 8, failed: 2, ineligible: 40 }));
    expect(row.successRatio).toBe(0.8);
    expect(row.asked).toBe(50);
  });

  it("reports no rate for a vendor nobody reached, rather than a perfect or a failing one", () => {
    expect(reliabilityOf(counts({ ineligible: 12 })).successRatio).toBeNull();
    expect(reliabilityOf(counts()).successRatio).toBeNull();
  });

  it("carries the median through untouched, including its absence", () => {
    expect(reliabilityOf(counts({ answered: 1, p50LatencyMs: 1420 })).p50LatencyMs).toBe(1420);
    expect(reliabilityOf(counts({ failed: 1 })).p50LatencyMs).toBeNull();
  });

  it("rounds the rate to four places, as the duplicate metrics do", () => {
    expect(reliabilityOf(counts({ answered: 2, failed: 1 })).successRatio).toBe(0.6667);
  });
});

describe("rankableRates", () => {
  const measured = (provider: string, answered: number, failed: number) =>
    reliabilityOf(counts({ provider, answered, failed }));

  it("offers a rate for a vendor with enough asks behind it", () => {
    expect(rankableRates([measured("nausys", 990, 10)]).get("nausys")).toBe(0.99);
  });

  it("withholds one for a vendor nobody has asked much", () => {
    /* A connector switched on last week has answered a handful of times, and the comparator
       reads an absent rate as "not rankable" rather than as a bad one. */
    expect(rankableRates([measured("mock", 9, 1)]).has("mock")).toBe(false);
  });

  it("withholds one for a vendor reached only by our own cache's refusals", () => {
    const untouched = reliabilityOf(counts({ provider: "mock", ineligible: 900 }));
    expect(rankableRates([untouched]).has("mock")).toBe(false);
  });

  it("counts failures toward the sample, since a vendor that broke was still asked", () => {
    expect(rankableRates([measured("nausys", 30, 30)]).get("nausys")).toBe(0.5);
  });
});
