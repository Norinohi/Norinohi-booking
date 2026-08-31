import { describe, expect, it } from "vitest";

import {
  canCheckIn,
  canCheckOut,
  type CharterConstraints,
  type CharterRule,
  firstBookablePeriod,
  firstCheckOut,
  offeredCheckOut,
  nightsBetween,
  rangeStatus,
  weekdayOf,
} from "./availability-rules";

/*
 * The four rule shapes the fleet actually publishes, counted off `listing_checkin_rule`.
 * The three flexible ones are the reason this module exists: the synthesized slot list
 * cannot express them, so they are the cases most likely to regress.
 */
const SAT_WEEK: CharterRule = {
  checkinWeekday: 6,
  checkoutWeekday: 6,
  minNights: 7,
  maxNights: null,
}; // 104 listings
const SAT_TO_FRI: CharterRule = {
  checkinWeekday: 6,
  checkoutWeekday: 5,
  minNights: 6,
  maxNights: null,
}; // 1 listing
const ANY_DAY_MIN_3: CharterRule = {
  checkinWeekday: null,
  checkoutWeekday: null,
  minNights: 3,
  maxNights: null,
}; // 3 listings
const ANY_DAY_MIN_1: CharterRule = {
  checkinWeekday: null,
  checkoutWeekday: null,
  minNights: 1,
  maxNights: null,
}; // 1 listing

/** 2026-08-15 and 2026-08-22 are Saturdays; 2026-08-18 a Tuesday, 2026-08-21 a Friday. */
const OPEN_SEASON = [{ startDate: "2026-08-01", endDate: "2026-10-01" }];

function constraints(overrides: Partial<CharterConstraints> = {}): CharterConstraints {
  return {
    rules: [SAT_WEEK],
    occupied: [],
    priced: OPEN_SEASON,
    ...overrides,
  };
}

describe("date helpers", () => {
  it("reads weekdays in UTC so a local timezone cannot shift the day", () => {
    expect(weekdayOf("2026-08-15")).toBe(6);
    expect(weekdayOf("2026-08-18")).toBe(2);
  });

  it("counts nights, not calendar days touched", () => {
    expect(nightsBetween("2026-08-15", "2026-08-22")).toBe(7);
    expect(nightsBetween("2026-08-15", "2026-08-16")).toBe(1);
  });
});

describe("rangeStatus", () => {
  it("accepts the Saturday week the bulk of the fleet sells", () => {
    expect(rangeStatus("2026-08-15", "2026-08-22", constraints())).toBe("bookable");
  });

  it("accepts a longer stay when the rule sets no maximum", () => {
    expect(rangeStatus("2026-08-15", "2026-08-29", constraints())).toBe("bookable");
  });

  it("rejects a check-in on the wrong weekday", () => {
    expect(rangeStatus("2026-08-18", "2026-08-25", constraints())).toBe("checkin-day");
  });

  it("rejects a check-out on the wrong weekday", () => {
    expect(rangeStatus("2026-08-15", "2026-08-19", constraints())).toBe("checkout-day");
  });

  it("honours a rule whose check-out day differs from its check-in day", () => {
    const satToFri = constraints({ rules: [SAT_TO_FRI] });
    expect(rangeStatus("2026-08-15", "2026-08-21", satToFri)).toBe("bookable");
    expect(rangeStatus("2026-08-15", "2026-08-22", satToFri)).toBe("checkout-day");
  });

  /* The case the enumerated slot list cannot represent at all. */
  it("accepts any start day and any length for an unconstrained listing", () => {
    const flexible = constraints({ rules: [ANY_DAY_MIN_1] });
    expect(rangeStatus("2026-08-18", "2026-08-19", flexible)).toBe("bookable");
    expect(rangeStatus("2026-08-19", "2026-08-26", flexible)).toBe("bookable");
  });

  it("enforces a minimum stay", () => {
    const minThree = constraints({ rules: [ANY_DAY_MIN_3] });
    expect(rangeStatus("2026-08-18", "2026-08-20", minThree)).toBe("too-short");
    expect(rangeStatus("2026-08-18", "2026-08-21", minThree)).toBe("bookable");
  });

  it("enforces a maximum stay when one is published", () => {
    const capped = constraints({ rules: [{ ...ANY_DAY_MIN_3, maxNights: 5 }] });
    expect(rangeStatus("2026-08-18", "2026-08-24", capped)).toBe("too-long");
  });

  it("admits a range that any one rule accepts", () => {
    const either = constraints({ rules: [SAT_WEEK, ANY_DAY_MIN_3] });
    expect(rangeStatus("2026-08-18", "2026-08-21", either)).toBe("bookable");
  });

  it("reports a length failure over a weekday failure when both are in play", () => {
    const either = constraints({ rules: [ANY_DAY_MIN_3, SAT_WEEK] });
    expect(rangeStatus("2026-08-18", "2026-08-19", either)).toBe("too-short");
  });

  it("admits any shape when the provider published no rule", () => {
    expect(rangeStatus("2026-08-18", "2026-08-19", constraints({ rules: [] }))).toBe("bookable");
  });

  it("rejects a range that overlaps a booking", () => {
    const booked = constraints({
      occupied: [{ startDate: "2026-08-19", endDate: "2026-08-26" }],
    });
    expect(rangeStatus("2026-08-15", "2026-08-22", booked)).toBe("occupied");
  });

  /* Charters change hands on the same day; treating that as a clash would lose every turnaround. */
  it("allows a charter starting the day another ends", () => {
    const booked = constraints({
      occupied: [{ startDate: "2026-08-08", endDate: "2026-08-15" }],
    });
    expect(rangeStatus("2026-08-15", "2026-08-22", booked)).toBe("bookable");
  });

  it("allows a charter ending the day another begins", () => {
    const booked = constraints({
      occupied: [{ startDate: "2026-08-22", endDate: "2026-08-29" }],
    });
    expect(rangeStatus("2026-08-15", "2026-08-22", booked)).toBe("bookable");
  });

  /* Every 2027 date behaves this way today: free-looking, but the season is not on sale. */
  it("rejects a range in a season the provider has not priced", () => {
    expect(rangeStatus("2027-08-14", "2027-08-21", constraints())).toBe("season-closed");
  });

  it("rejects a range that ends before it starts", () => {
    expect(rangeStatus("2026-08-22", "2026-08-15", constraints())).toBe("invalid-range");
    expect(rangeStatus("2026-08-15", "2026-08-15", constraints())).toBe("invalid-range");
  });
});

describe("canCheckIn", () => {
  it("accepts a legal weekday inside an open, free season", () => {
    expect(canCheckIn("2026-08-15", constraints())).toBe(true);
  });

  it("rejects a weekday no rule allows", () => {
    expect(canCheckIn("2026-08-18", constraints())).toBe(false);
  });

  it("rejects a day inside a booking", () => {
    const booked = constraints({
      occupied: [{ startDate: "2026-08-12", endDate: "2026-08-19" }],
    });
    expect(canCheckIn("2026-08-15", booked)).toBe(false);
  });

  it("accepts the turnaround day a booking ends on", () => {
    const booked = constraints({
      occupied: [{ startDate: "2026-08-08", endDate: "2026-08-15" }],
    });
    expect(canCheckIn("2026-08-15", booked)).toBe(true);
  });

  it("rejects a day in a season with no published rate", () => {
    expect(canCheckIn("2027-08-14", constraints())).toBe(false);
  });
});

/*
 * The bug this half of the module exists for. A day passing the cheap tests -- right weekday,
 * nothing booked over it, inside a published rate -- can still begin no charter anyone will
 * sell, and offering it produced two visible failures: calendar days that greyed out every
 * possible end once clicked, and a search card naming an "available from" date the detail page
 * then refused. Proven against listing five-o-sun-odyssey-509, whose rules claimed all seven
 * turnarounds while every rate it published ran Saturday to Saturday.
 */
describe("canCheckIn with no legal check-out", () => {
  it("rejects a gap too short for the minimum stay", () => {
    const tightGap = constraints({
      rules: [SAT_WEEK],
      occupied: [{ startDate: "2026-08-20", endDate: "2026-09-05" }],
    });
    // A Saturday, free, and inside the season, but the next booking lands four days later.
    expect(canCheckIn("2026-08-15", tightGap)).toBe(false);
  });

  it("rejects a day the season closes under before the charter could end", () => {
    const closing = constraints({ priced: [{ startDate: "2026-08-01", endDate: "2026-08-20" }] });
    expect(canCheckIn("2026-08-15", closing)).toBe(true);
    expect(canCheckIn("2026-08-22", closing)).toBe(false);
  });

  it("still accepts a day whose only legal charter is a long one", () => {
    const fortnight = constraints({ rules: [{ ...SAT_WEEK, minNights: 14 }] });
    expect(canCheckIn("2026-08-15", fortnight)).toBe(true);
  });
});

describe("firstCheckOut", () => {
  it("takes the shortest legal charter, whatever the rules were written for", () => {
    expect(firstCheckOut("2026-08-18", constraints({ rules: [ANY_DAY_MIN_1] }))).toBe("2026-08-19");
  });

  it("honours a rule whose check-out weekday forces a longer stay", () => {
    expect(firstCheckOut("2026-08-15", constraints({ rules: [SAT_TO_FRI] }))).toBe("2026-08-21");
  });

  it("returns null for a day that begins nothing sellable", () => {
    expect(firstCheckOut("2026-08-18", constraints())).toBeNull();
  });
});

/*
 * What a search card prints. The rule's own minimum, not the shortest thing the rules fail to
 * forbid: a listing that published no minimum is silent, not selling single nights, and the
 * price beside the dates is a weekly one.
 */
describe("offeredCheckOut", () => {
  it("assumes a week where the rules state no minimum", () => {
    const silent = constraints({ rules: [{ ...SAT_WEEK, minNights: null }] });
    expect(offeredCheckOut("2026-08-15", silent)).toBe("2026-08-22");
  });

  it("assumes a week where the provider published no rule at all", () => {
    expect(offeredCheckOut("2026-08-18", constraints({ rules: [] }))).toBe("2026-08-25");
  });

  it("takes the rule's minimum when it states one", () => {
    expect(offeredCheckOut("2026-08-18", constraints({ rules: [ANY_DAY_MIN_3] }))).toBe(
      "2026-08-21",
    );
    expect(offeredCheckOut("2026-08-15", constraints({ rules: [SAT_TO_FRI] }))).toBe("2026-08-21");
  });

  it("takes the shortest across alternatives", () => {
    const either = constraints({ rules: [SAT_WEEK, ANY_DAY_MIN_3] });
    expect(offeredCheckOut("2026-08-15", either)).toBe("2026-08-18");
  });

  it("falls back to a legal charter the rules did not describe", () => {
    /* A maximum below the assumed week leaves the rule with no length of its own to offer. */
    const capped = constraints({ rules: [{ ...ANY_DAY_MIN_1, minNights: null, maxNights: 3 }] });
    expect(offeredCheckOut("2026-08-18", capped)).toBe("2026-08-19");
  });
});

/*
 * The production shape this exists for. NauSYS yacht 29476220 publishes whole Saturday weeks,
 * four months of three-night any-day stays in spring 2025, and whole Saturday weeks after
 * that. Read as one permanent set of alternatives, the lapsed middle rule kept a three-night
 * September 2026 charter on the card that the vendor's offers engine refused outright.
 */
describe("seasonal rules", () => {
  const LAPSED_MIN_3: CharterRule = {
    ...ANY_DAY_MIN_3,
    seasonStart: "2025-01-01",
    seasonEnd: "2025-05-04",
  };
  const SAT_WEEK_SINCE: CharterRule = { ...SAT_WEEK, seasonStart: "2025-05-05", seasonEnd: null };
  const seasonal = constraints({ rules: [LAPSED_MIN_3, SAT_WEEK_SINCE] });

  it("refuses a charter only a lapsed rule would have admitted", () => {
    expect(rangeStatus("2026-08-18", "2026-08-21", seasonal)).toBe("checkin-day");
  });

  it("still sells the week the rule in force describes", () => {
    expect(rangeStatus("2026-08-15", "2026-08-22", seasonal)).toBe("bookable");
  });

  it("would have admitted the same charter inside the lapsed rule's own season", () => {
    const inSeason = constraints({
      rules: [LAPSED_MIN_3],
      priced: [{ startDate: "2025-01-01", endDate: "2025-06-01" }],
    });
    expect(rangeStatus("2025-03-04", "2025-03-07", inSeason)).toBe("bookable");
  });

  it("keeps a mid-week day out of the calendar once its rule has lapsed", () => {
    expect(canCheckIn("2026-08-18", seasonal)).toBe(false);
    expect(canCheckIn("2026-08-15", seasonal)).toBe(true);
  });

  it("offers the length of the rule in force, not the lapsed one", () => {
    expect(offeredCheckOut("2026-08-15", seasonal)).toBe("2026-08-22");
  });

  it("sells nothing on a day every published rule has expired for", () => {
    const allLapsed = constraints({ rules: [LAPSED_MIN_3] });
    expect(rangeStatus("2026-08-15", "2026-08-22", allLapsed)).toBe("season-closed");
    expect(canCheckIn("2026-08-15", allLapsed)).toBe(false);
  });

  it("treats a rule with no season as in force throughout, which is how BM writes them", () => {
    expect(rangeStatus("2026-08-15", "2026-08-22", constraints())).toBe("bookable");
  });
});

describe("firstBookablePeriod", () => {
  it("walks forward to the first day that begins a charter", () => {
    expect(firstBookablePeriod("2026-08-11", constraints())).toEqual({
      startDate: "2026-08-15",
      endDate: "2026-08-22",
    });
  });

  it("skips a day that passes the cheap tests but begins nothing", () => {
    const tightGap = constraints({
      occupied: [{ startDate: "2026-08-20", endDate: "2026-09-05" }],
    });
    expect(firstBookablePeriod("2026-08-15", tightGap)).toEqual({
      startDate: "2026-09-05",
      endDate: "2026-09-12",
    });
  });

  it("gives up rather than inventing a period in a closed season", () => {
    expect(firstBookablePeriod("2027-08-14", constraints())).toBeNull();
  });
});

describe("canCheckOut", () => {
  it("accepts only the days that complete a legal charter", () => {
    expect(canCheckOut("2026-08-22", "2026-08-15", constraints())).toBe(true);
    expect(canCheckOut("2026-08-19", "2026-08-15", constraints())).toBe(false);
  });
});

/*
 * A refusal is the vendor answering about one charter, not about the days it spans. Folding
 * refusals into `occupied` inferred the second from the first: a customer who asked for a
 * fortnight and was told no lost the free week starting the same Saturday, and the boat read
 * as gone when it was not. Proven against a real listing whose booking began mid-fortnight.
 */
describe("a refused period", () => {
  const refused = () =>
    constraints({
      priced: [{ startDate: "2026-11-01", endDate: "2026-12-31" }],
      refused: [{ startDate: "2026-11-07", endDate: "2026-11-21" }],
    });

  it("blocks exactly the period the provider turned down", () => {
    expect(rangeStatus("2026-11-07", "2026-11-21", refused())).toBe("refused");
  });

  it("leaves a shorter charter from the same day bookable", () => {
    // The case that regressed: overlap matching killed this one too.
    expect(rangeStatus("2026-11-07", "2026-11-14", refused())).toBe("bookable");
  });

  /*
   * A charter needs the boat for every day it spans, so one that swallows a refused stretch
   * cannot happen either. Measured rather than assumed: of twelve refused weeks sampled from
   * the Booking Manager sweep on 2026-08-21, none had a fortnight or a three-week charter on
   * offer from the same day, against a control week where both were offered.
   */
  it("refuses a longer charter that contains the refused period", () => {
    expect(rangeStatus("2026-11-07", "2026-11-28", refused())).toBe("refused");
  });

  it("leaves a charter ending on the same day bookable", () => {
    expect(rangeStatus("2026-11-14", "2026-11-21", refused())).toBe("bookable");
  });

  it("still lets the calendar offer that start date, on the lengths that survive", () => {
    expect(canCheckIn("2026-11-07", refused())).toBe(true);
    expect(canCheckOut("2026-11-14", "2026-11-07", refused())).toBe(true);
    expect(canCheckOut("2026-11-21", "2026-11-07", refused())).toBe(false);
  });

  /*
   * The whole-week case the Booking Manager sweep actually produces: the vendor publishes a
   * rate for the week of 19 September and no offer for it, and every longer charter from that
   * Saturday is refused too, so the day leaves the calendar entirely rather than staying
   * clickable on a fortnight nobody priced.
   */
  it("closes the start day when every legal length from it is refused", () => {
    const weekly = constraints({
      rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: null, maxNights: null }],
      priced: [{ startDate: "2026-09-19", endDate: "2026-10-24" }],
      refused: [{ startDate: "2026-09-19", endDate: "2026-09-26" }],
    });

    expect(rangeStatus("2026-09-19", "2026-09-26", weekly)).toBe("refused");
    expect(rangeStatus("2026-09-19", "2026-10-03", weekly)).toBe("refused");
    expect(canCheckIn("2026-09-19", weekly)).toBe(false);
    expect(canCheckIn("2026-09-26", weekly)).toBe(true);
  });

  it("is absent by default, so nothing changes for constraints that carry none", () => {
    expect(rangeStatus("2026-08-15", "2026-08-22", constraints())).toBe("bookable");
  });
});
