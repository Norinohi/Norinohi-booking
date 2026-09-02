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
    const plan = sweepWindows([{ startDate: "2026-10-03", endDate: "2026-10-10" }], [], TODAY);

    expect(plan.advertised).toEqual([{ periodFrom: "2026-10-03", periodTo: "2026-10-10" }]);
    expect(plan.grid).toEqual([]);
  });

  it("carries the hulls advertising a week through to the ask", () => {
    const plan = sweepWindows(
      [{ startDate: "2026-10-03", endDate: "2026-10-10", yachtIds: ["4711001"] }],
      [],
      TODAY,
    );

    expect(plan.advertised).toEqual([
      { periodFrom: "2026-10-03", periodTo: "2026-10-10", yachtIds: ["4711001"] },
    ]);
  });

  /* A window carrying a hull list is asked about those hulls alone, so the grid must never
     inherit the advertised one: it exists for the hulls that list leaves out. */
  it("leaves the standing grid's own weeks untargeted when no hulls are named for it", () => {
    const plan = sweepWindows([], grid, TODAY);

    for (const window of plan.grid) expect(window).not.toHaveProperty("yachtIds");
  });

  it("keeps the standing grid behind them, for the listings advertising no week at all", () => {
    const plan = sweepWindows([{ startDate: "2026-10-03", endDate: "2026-10-10" }], grid, TODAY);

    for (const week of grid) expect(plan.grid).toContainEqual(week);
    expect(plan.advertised).toContainEqual({ periodFrom: "2026-10-03", periodTo: "2026-10-10" });
  });

  it("asks about a period the grid could never guess", () => {
    // A four-night Tuesday charter: a real advertised period, and no Saturday week contains it.
    const midweek = { startDate: "2026-10-06", endDate: "2026-10-10" };

    expect(sweepWindows([midweek], grid, TODAY).advertised).toContainEqual({
      periodFrom: midweek.startDate,
      periodTo: midweek.endDate,
    });
  });

  it("asks once for a week the whole fleet advertises", () => {
    const repeated = Array.from({ length: 5 }, () => ({
      startDate: "2026-09-05",
      endDate: "2026-09-12",
    }));

    expect(sweepWindows(repeated, [], TODAY).advertised).toHaveLength(1);
  });

  /*
   * The pass never walks the whole list — five minutes an hour on the vendor's one lane — so
   * the order is the priority. The caller hands them over most-advertised first.
   */
  it("keeps the caller's order, which is the order the cards want", () => {
    const plan = sweepWindows(
      [
        { startDate: "2026-11-07", endDate: "2026-11-14" },
        { startDate: "2026-09-05", endDate: "2026-09-12" },
      ],
      [],
      TODAY,
    );

    expect(plan.advertised.map((window) => window.periodFrom)).toEqual([
      "2026-11-07",
      "2026-09-05",
    ]);
  });

  it("keeps a week's advertised position when the grid names it too", () => {
    const advertised = { startDate: "2026-10-03", endDate: "2026-10-10" };
    const plan = sweepWindows(
      [advertised],
      [{ periodFrom: advertised.startDate, periodTo: advertised.endDate }, ...grid],
      TODAY,
    );

    expect(plan.advertised[0]).toEqual({ periodFrom: "2026-10-03", periodTo: "2026-10-10" });
    expect(plan.grid.filter((window) => window.periodFrom === "2026-10-03")).toHaveLength(0);
  });

  it("drops a week that is already over, whoever named it", () => {
    const past = { startDate: "2026-08-01", endDate: "2026-08-08" };

    expect(
      sweepWindows([past], [{ periodFrom: past.startDate, periodTo: past.endDate }], TODAY),
    ).toEqual({ advertised: [], grid: [] });
  });
  /*
   * The split exists for the resume cursor, so this is the property that matters: the grid can
   * be resumed into, and the advertised half cannot be skipped past.
   *
   * Merged into one list with one index, the first budget-truncated run left the cursor inside
   * the grid and every run after it resumed there, skipping all sixty advertised periods until
   * the index wrapped. On the NauSYS fleet that was 60 of 6,985 dated cards priced for the week
   * they advertise, against 6,562 for the same pass walked from the front.
   */
  it("keeps the advertised half out of what a cursor can resume past", () => {
    const plan = sweepWindows([{ startDate: "2026-10-03", endDate: "2026-10-10" }], grid, TODAY);

    /* What the stream does with a cursor of 2: the grid is skipped into, the advertised half
       is walked whole regardless. */
    const resumed = [...plan.advertised, ...plan.grid.slice(2)];

    expect(resumed).toContainEqual({ periodFrom: "2026-10-03", periodTo: "2026-10-10" });
    expect(plan.grid.slice(2)).toHaveLength(grid.length - 2);
  });
  /*
   * The grid's own hulls: those advertising nothing. Asked about the whole fleet instead, it
   * re-priced the 6,900 hulls the targeted half had just confirmed -- 30 calls a window against
   * 2, and 780 across the grid against 52, which is most of a budget spent re-answering an
   * answered question.
   */
  it("asks the grid only about the hulls advertising nothing", () => {
    const plan = sweepWindows(
      [{ startDate: "2026-10-03", endDate: "2026-10-10", yachtIds: ["4711001"] }],
      grid,
      TODAY,
      ["4711002"],
    );

    for (const window of plan.grid) expect(window.yachtIds).toEqual(["4711002"]);
    /* Never the advertised half's own hulls, which the targeted ask already covers. */
    expect(plan.advertised[0]?.yachtIds).toEqual(["4711001"]);
  });

  /* Not the same as naming none: every hull advertises something, so the grid has nobody to
     ask about and its silence must judge nobody. */
  it("tells an empty hull list apart from naming no hulls at all", () => {
    const plan = sweepWindows([], grid, TODAY, []);

    for (const window of plan.grid) expect(window.yachtIds).toEqual([]);
  });
});
