import { describe, expect, it } from "vitest";

import { createConcurrencyGovernor } from "./concurrency-governor";

describe("createConcurrencyGovernor", () => {
  it("starts at the width it was given", () => {
    expect(createConcurrencyGovernor({ start: 4 }).limit()).toBe(4);
  });

  it("halves the width on each back-off and reports the new one", () => {
    const seen: number[] = [];
    const governor = createConcurrencyGovernor({
      start: 8,
      onBackOff: (limit) => seen.push(limit),
    });

    governor.backOff();
    governor.backOff();

    expect(seen).toEqual([4, 2]);
    expect(governor.limit()).toBe(2);
  });

  it("stops at one rather than at nothing, and stays there in silence", () => {
    const seen: number[] = [];
    const governor = createConcurrencyGovernor({
      start: 2,
      onBackOff: (limit) => seen.push(limit),
    });

    governor.backOff();
    governor.backOff();
    governor.backOff();

    expect(governor.limit()).toBe(1);
    expect(seen).toEqual([1]);
  });

  it("never widens again, so a quiet stretch does not undo the back-off", () => {
    const governor = createConcurrencyGovernor({ start: 4 });
    governor.backOff();
    expect(governor.limit()).toBe(2);
    expect(governor.limit()).toBe(2);
  });
});
