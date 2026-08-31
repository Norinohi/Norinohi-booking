import { describe, expect, it } from "vitest";

import { sweepWindows, upcomingCharterWeeks } from "./sweep-windows";

const TODAY = "2026-08-31";

/*
 * Which weeks the confirming sweep asks the vendor to price. It is the only place a NauSYS
 * price arrives net of the operator's discount, so a week it skips is a card advertising the
 * catalogue list rate — in a 30-listing production sample, eleven cards over their own quote
 * by 5% to 53%, every one of them NauSYS.
 */
describe("sweepWindows", () => {
  const grid = upcomingCharterWeeks(new Date("2026-08-31T00:00:00.000Z"), 3);

  it("asks about the weeks the cards are advertising", () => {
    const windows = sweepWindows([{ startDate: "2026-10-03", endDate: "2026-10-10" }], [], TODAY);

    expect(windows).toEqual([{ periodFrom: "2026-10-03", periodTo: "2026-10-10" }]);
  });

  it("keeps the standing grid behind them, for the listings advertising no week at all", () => {
    const windows = sweepWindows([{ startDate: "2026-10-03", endDate: "2026-10-10" }], grid, TODAY);

    for (const week of grid) expect(windows).toContainEqual(week);
    expect(windows).toContainEqual({ periodFrom: "2026-10-03", periodTo: "2026-10-10" });
  });

  it("asks about a period the grid could never guess", () => {
    // A four-night Tuesday charter: a real advertised period, and no Saturday week contains it.
    const midweek = { startDate: "2026-10-06", endDate: "2026-10-10" };

    expect(sweepWindows([midweek], grid, TODAY)).toContainEqual({
      periodFrom: midweek.startDate,
      periodTo: midweek.endDate,
    });
  });

  it("asks once for a week the whole fleet advertises", () => {
    const repeated = Array.from({ length: 5 }, () => ({
      startDate: "2026-09-05",
      endDate: "2026-09-12",
    }));

    expect(sweepWindows(repeated, [], TODAY)).toHaveLength(1);
  });

  /*
   * The pass never walks the whole list — five minutes an hour on the vendor's one lane — so
   * the order is the priority. The caller hands them over most-advertised first.
   */
  it("keeps the caller's order, which is the order the cards want", () => {
    const windows = sweepWindows(
      [
        { startDate: "2026-11-07", endDate: "2026-11-14" },
        { startDate: "2026-09-05", endDate: "2026-09-12" },
      ],
      [],
      TODAY,
    );

    expect(windows.map((window) => window.periodFrom)).toEqual(["2026-11-07", "2026-09-05"]);
  });

  it("keeps a week's advertised position when the grid names it too", () => {
    const advertised = { startDate: "2026-10-03", endDate: "2026-10-10" };
    const windows = sweepWindows(
      [advertised],
      [{ periodFrom: advertised.startDate, periodTo: advertised.endDate }, ...grid],
      TODAY,
    );

    expect(windows[0]).toEqual({ periodFrom: "2026-10-03", periodTo: "2026-10-10" });
    expect(windows.filter((window) => window.periodFrom === "2026-10-03")).toHaveLength(1);
  });

  it("drops a week that is already over, whoever named it", () => {
    const past = { startDate: "2026-08-01", endDate: "2026-08-08" };

    expect(
      sweepWindows([past], [{ periodFrom: past.startDate, periodTo: past.endDate }], TODAY),
    ).toEqual([]);
  });
});
