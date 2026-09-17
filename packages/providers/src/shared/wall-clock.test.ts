import { describe, expect, it } from "vitest";

import { wallClockTime } from "./wall-clock";

describe("wallClockTime", () => {
  it("reads the clock out of each vendor's shape", () => {
    expect(wallClockTime("17:00")).toBe("17:00");
    expect(wallClockTime("9:30")).toBe("09:30");
    expect(wallClockTime("2026-11-14 17:00:00")).toBe("17:00");
    expect(wallClockTime("2026-11-21T09:00:00")).toBe("09:00");
    expect(wallClockTime(" 08:00:00 ")).toBe("08:00");
  });

  it("says nothing rather than inventing a midnight", () => {
    expect(wallClockTime(undefined)).toBeUndefined();
    expect(wallClockTime(null)).toBeUndefined();
    expect(wallClockTime("")).toBeUndefined();
    expect(wallClockTime("2026-11-14")).toBeUndefined();
    expect(wallClockTime("25:00")).toBeUndefined();
    expect(wallClockTime("noon")).toBeUndefined();
  });
});
