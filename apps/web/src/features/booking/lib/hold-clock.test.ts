import { describe, expect, it } from "vitest";

import { holdRemaining } from "./hold-clock";

const expiresAt = "2026-09-19T21:44:00.000Z";
const at = (iso: string) => Date.parse(iso);

describe("holdRemaining", () => {
  it("counts whole hours past a day instead of switching to days", () => {
    expect(holdRemaining(expiresAt, at("2026-09-17T22:32:00.000Z"))).toEqual({
      expired: false,
      hours: 47,
      minutes: 12,
    });
  });

  it("rounds a part minute up so a live hold never reads zero", () => {
    expect(holdRemaining(expiresAt, at("2026-09-19T21:43:30.000Z"))).toEqual({
      expired: false,
      hours: 0,
      minutes: 1,
    });
  });

  it("is expired at the deadline and after it", () => {
    expect(holdRemaining(expiresAt, at(expiresAt))).toEqual({ expired: true });
    expect(holdRemaining(expiresAt, at("2026-09-20T08:00:00.000Z"))).toEqual({ expired: true });
  });

  it("treats an unparseable deadline as expired rather than open-ended", () => {
    expect(holdRemaining("not a date", at(expiresAt))).toEqual({ expired: true });
  });
});
