import { describe, expect, it } from "vitest";

import { type ProviderCounts, reliabilityOf } from "./provider-reliability";

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
