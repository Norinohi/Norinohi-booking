import { describe, expect, it } from "vitest";

import { charterRange, dayWithHandover, handoverTime } from "./handover";

describe("handoverTime", () => {
  it("reads the marina's time off a charter stamp", () => {
    expect(handoverTime("2026-11-14T17:00:00.000Z")).toBe("17:00");
    expect(handoverTime("2026-11-21T09:00:00.000Z")).toBe("09:00");
  });

  it("treats the midnight written for a missing time as none", () => {
    expect(handoverTime("2026-11-14T00:00:00.000Z")).toBeNull();
    expect(handoverTime("2026-11-14")).toBeNull();
  });
});

describe("dayWithHandover", () => {
  it("adds the time only where there is one", () => {
    expect(dayWithHandover("14 Nov 2026", "17:00")).toBe("14 Nov 2026, 17:00");
    expect(dayWithHandover("14 Nov 2026", null)).toBe("14 Nov 2026");
    expect(dayWithHandover("14 Nov 2026", undefined)).toBe("14 Nov 2026");
  });
});

describe("charterRange", () => {
  const day = (stamp: string) => stamp.slice(0, 10);

  it("names both handovers the booking recorded", () => {
    expect(charterRange(day, "2026-11-14T17:00:00.000Z", "2026-11-21T09:00:00.000Z")).toBe(
      "2026-11-14, 17:00 → 2026-11-21, 09:00",
    );
  });

  it("falls back to the bare day on an end with no time", () => {
    expect(charterRange(day, "2026-11-14T17:00:00.000Z", "2026-11-21T00:00:00.000Z")).toBe(
      "2026-11-14, 17:00 → 2026-11-21",
    );
  });
});
