import { describe, expect, it } from "vitest";

import {
  canCheckIn,
  canCheckOut,
  type CharterConstraints,
  type CharterRule,
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

describe("canCheckOut", () => {
  it("accepts only the days that complete a legal charter", () => {
    expect(canCheckOut("2026-08-22", "2026-08-15", constraints())).toBe(true);
    expect(canCheckOut("2026-08-19", "2026-08-15", constraints())).toBe(false);
  });
});
