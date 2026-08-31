import { describe, expect, it } from "vitest";

import type { CharterRule } from "./availability-rules";
import { summariseCharterRules } from "./charter-period";

const rule = (over: Partial<CharterRule> = {}): CharterRule => ({
  checkinWeekday: null,
  checkoutWeekday: null,
  minNights: null,
  maxNights: null,
  ...over,
});

/** What Booking Manager sends for a yacht that claims every check-in day. */
const everyWeekday = Array.from({ length: 7 }, (_, day) =>
  rule({ checkinWeekday: day, checkoutWeekday: day }),
);

describe("summariseCharterRules", () => {
  /*
   * The sentence this was written for. Seven paired rules are one rule -- whole weeks, any
   * start day -- and reading them out produced "Sunday to Sunday, or Monday to Monday" through
   * all seven days on the detail page.
   */
  it("folds a rule per weekday into one that names no weekday", () => {
    expect(summariseCharterRules(everyWeekday)).toEqual([
      {
        checkinWeekdays: null,
        checkoutWeekday: null,
        wholeWeeks: true,
        minNights: null,
        maxNights: null,
      },
    ]);
  });

  it("keeps a partial set of start days as a set", () => {
    const [summary] = summariseCharterRules([
      rule({ checkinWeekday: 5, checkoutWeekday: 5 }),
      rule({ checkinWeekday: 6, checkoutWeekday: 6 }),
    ]);

    expect(summary?.checkinWeekdays).toEqual([5, 6]);
    expect(summary?.wholeWeeks).toBe(true);
  });

  it("sorts the days it collected, whatever order the rules arrived in", () => {
    const [summary] = summariseCharterRules([
      rule({ checkinWeekday: 6, checkoutWeekday: 6 }),
      rule({ checkinWeekday: 1, checkoutWeekday: 1 }),
    ]);

    expect(summary?.checkinWeekdays).toEqual([1, 6]);
  });

  it("keeps a single Saturday week as one turnaround rather than a set of one", () => {
    expect(
      summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 })]).at(0),
    ).toEqual({
      checkinWeekdays: [6],
      checkoutWeekday: null,
      wholeWeeks: true,
      minNights: 7,
      maxNights: null,
    });
  });

  it("does not fold across different lengths, which are different alternatives", () => {
    const summary = summariseCharterRules([
      rule({ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }),
      rule({ checkinWeekday: 6, checkoutWeekday: 3, minNights: 3 }),
    ]);

    expect(summary).toHaveLength(2);
  });

  /*
   * The check-out weekday fixes the length modulo a week, so a stated minimum below it is a
   * floor no charter can stand on. Saying it out loud produced "in whole weeks, from 3
   * nights" on a listing whose shortest legal charter is seven.
   */
  describe("the shortest charter a rule really admits", () => {
    it("reads a sub-week minimum on a whole-week rule as a week", () => {
      expect(
        summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 6, minNights: 3 })]).at(
          0,
        ),
      ).toMatchObject({ wholeWeeks: true, minNights: 7 });
    });

    it("takes the weekday pair's own span when the rule asks for less", () => {
      // Saturday to Wednesday is four nights, whatever minimum sits beside it.
      expect(
        summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 3, minNights: 3 })]).at(
          0,
        ),
      ).toMatchObject({ checkoutWeekday: 3, minNights: 4 });
    });

    it("steps a longer minimum up to the next length the pair allows", () => {
      // Saturday to Wednesday again: 4, 11, 18 - so a stated 6 is really 11.
      expect(
        summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 3, minNights: 6 })]).at(
          0,
        ),
      ).toMatchObject({ minNights: 11 });
    });

    it("leaves a minimum the pair already allows alone", () => {
      expect(
        summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 6, minNights: 14 })]).at(
          0,
        ),
      ).toMatchObject({ minNights: 14 });
    });

    it("says nothing new where no weekday is named, since any length could be legal", () => {
      expect(
        summariseCharterRules([
          rule({ checkinWeekday: null, checkoutWeekday: null, minNights: 3 }),
        ]).at(0),
      ).toMatchObject({ minNights: 3 });
    });

    it("folds two turnarounds that only looked different into one alternative", () => {
      // Both sell whole weeks from seven nights; the start day is all that differs.
      const summary = summariseCharterRules([
        rule({ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }),
        rule({ checkinWeekday: 5, checkoutWeekday: 5, minNights: 3 }),
      ]);

      expect(summary).toEqual([
        expect.objectContaining({ checkinWeekdays: [5, 6], wholeWeeks: true, minNights: 7 }),
      ]);
    });
  });

  it("keeps a check-out day that is not the day the charter began", () => {
    expect(
      summariseCharterRules([rule({ checkinWeekday: 6, checkoutWeekday: 5, minNights: 6 })]).at(0),
    ).toEqual({
      checkinWeekdays: [6],
      checkoutWeekday: 5,
      wholeWeeks: false,
      minNights: 6,
      maxNights: null,
    });
  });

  it("lets an any-day alternative swallow the named days it shares a length with", () => {
    const summary = summariseCharterRules([
      rule({ checkinWeekday: 6, minNights: 7 }),
      rule({ minNights: 7 }),
    ]);

    expect(summary).toEqual([
      {
        checkinWeekdays: null,
        checkoutWeekday: null,
        wholeWeeks: false,
        minNights: 7,
        maxNights: null,
      },
    ]);
  });

  it("drops a rule that constrains nothing rather than saying so out loud", () => {
    expect(summariseCharterRules([rule()])).toEqual([]);
  });
});
