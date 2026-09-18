import { describe, expect, it } from "vitest";

import { hullsEligibleOn } from "./checkin-weekdays";

describe("hullsEligibleOn", () => {
  const hulls = [
    { yachtId: "1001", seasonStart: null, seasonEnd: null },
    { yachtId: "1002", seasonStart: "2026-05-01", seasonEnd: "2026-09-30" },
    /* The same hull twice: one rule for the summer, another for the shoulder. */
    { yachtId: "1003", seasonStart: "2026-05-01", seasonEnd: "2026-06-30" },
    { yachtId: "1003", seasonStart: "2026-10-01", seasonEnd: "2026-10-31" },
  ];

  it("keeps a rule that states no season at all", () => {
    expect(hullsEligibleOn(hulls, "2027-02-14")).toEqual(["1001"]);
  });

  it("keeps a hull only while its rule is in force", () => {
    expect(hullsEligibleOn(hulls, "2026-09-20")).toEqual(["1001", "1002"]);
    expect(hullsEligibleOn(hulls, "2026-10-04")).toEqual(["1001", "1003"]);
  });

  it("names a hull once however many of its rules cover the day", () => {
    expect(
      hullsEligibleOn(
        [...hulls, { yachtId: "1001", seasonStart: null, seasonEnd: null }],
        "2026-06-06",
      ),
    ).toEqual(["1001", "1002", "1003"]);
  });
});
