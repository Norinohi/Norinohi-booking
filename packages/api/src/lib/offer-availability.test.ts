import { describe, expect, it } from "vitest";

import type { CharterRule } from "./availability-rules";
import {
  combinedCanCheckIn,
  combinedFirstBookablePeriod,
  combinedLegalCheckOuts,
  combinedOfferedCheckOut,
  combinedRangeStatus,
  type OfferConstraints,
} from "./offer-availability";

const SAT_WEEK: CharterRule = {
  checkinWeekday: 6,
  checkoutWeekday: 6,
  minNights: 7,
  maxNights: null,
};
const ANY_DAY_MIN_3: CharterRule = {
  checkinWeekday: null,
  checkoutWeekday: null,
  minNights: 3,
  maxNights: null,
};

/* A whole open season either vendor could sell out of. */
const SEASON = [{ startDate: "2026-04-01", endDate: "2026-10-31" }];

const offer = (over: Partial<OfferConstraints> = {}): OfferConstraints => ({
  offerId: "loff_a",
  providerCode: "nausys",
  rules: [SAT_WEEK],
  occupied: [],
  priced: SEASON,
  refused: [],
  ...over,
});

/* 2026-08-08 and 2026-08-15 are both Saturdays. */
const SATURDAY = "2026-08-08";
const NEXT_SATURDAY = "2026-08-15";

describe("combinedRangeStatus", () => {
  it("sells the week when one vendor has it free and the other has it booked", () => {
    const result = combinedRangeStatus(SATURDAY, NEXT_SATURDAY, [
      offer({ offerId: "loff_busy", occupied: [{ startDate: SATURDAY, endDate: NEXT_SATURDAY }] }),
      offer({ offerId: "loff_free", providerCode: "booking_manager" }),
    ]);
    expect(result).toEqual({ verdict: "bookable", offerId: "loff_free" });
  });

  it("names the first offer that would sell it, so the caller's order decides", () => {
    const result = combinedRangeStatus(SATURDAY, NEXT_SATURDAY, [
      offer({ offerId: "loff_cheap" }),
      offer({ offerId: "loff_dear", providerCode: "booking_manager" }),
    ]);
    expect(result.offerId).toBe("loff_cheap");
  });

  it("reports the objection that got closest to a sale when everybody refuses", () => {
    // One vendor does not sell that season at all; the other sells it but not from a Tuesday.
    // The weekday is the answer the visitor can act on.
    const result = combinedRangeStatus("2026-08-11", "2026-08-18", [
      offer({ offerId: "loff_closed", priced: [] }),
      offer({ offerId: "loff_saturdays", providerCode: "booking_manager" }),
    ]);
    expect(result).toEqual({ verdict: "checkin-day", offerId: null });
  });

  it("prefers a shape objection over a boat that is simply sold", () => {
    // The free vendor turns around on Saturdays, so a Tuesday finish is a rule the visitor
    // can work around. "Occupied" from the other vendor is a dead end and says less.
    const result = combinedRangeStatus(SATURDAY, "2026-08-11", [
      offer({ offerId: "loff_sold", occupied: [{ startDate: SATURDAY, endDate: NEXT_SATURDAY }] }),
      offer({ offerId: "loff_saturdays", providerCode: "booking_manager" }),
    ]);
    expect(result.verdict).toBe("checkout-day");
  });

  it("calls an impossible range invalid whoever is asked", () => {
    const result = combinedRangeStatus(NEXT_SATURDAY, SATURDAY, [offer()]);
    expect(result).toEqual({ verdict: "invalid-range", offerId: null });
  });

  it("says a listing nobody sells is closed, never occupied", () => {
    // Claiming occupancy would assert a booking that does not exist.
    expect(combinedRangeStatus(SATURDAY, NEXT_SATURDAY, [])).toEqual({
      verdict: "season-closed",
      offerId: null,
    });
  });
});

describe("combinedCanCheckIn", () => {
  it("opens a day either vendor will start on", () => {
    const offers = [offer(), offer({ offerId: "loff_flex", rules: [ANY_DAY_MIN_3] })];
    expect(combinedCanCheckIn("2026-08-11", offers)).toBe(true);
  });

  it("closes a day neither will start on", () => {
    expect(combinedCanCheckIn("2026-08-11", [offer(), offer({ offerId: "loff_b" })])).toBe(false);
  });
});

describe("combinedLegalCheckOuts", () => {
  it("unions the days, because a day one vendor refuses the other may sell", () => {
    const days = combinedLegalCheckOuts(SATURDAY, [
      offer(),
      offer({ offerId: "loff_flex", rules: [ANY_DAY_MIN_3] }),
    ]);
    expect(days).toContain("2026-08-11");
    expect(days).toContain(NEXT_SATURDAY);
  });

  it("returns each day once, earliest first", () => {
    const days = combinedLegalCheckOuts(SATURDAY, [offer(), offer({ offerId: "loff_b" })]);
    expect(days).toEqual([...new Set(days)]);
    expect([...days].sort()).toEqual(days);
  });
});

describe("combinedOfferedCheckOut", () => {
  it("offers the shortest charter anybody sells from that day", () => {
    const offers = [offer(), offer({ offerId: "loff_flex", rules: [ANY_DAY_MIN_3] })];
    expect(combinedOfferedCheckOut(SATURDAY, offers)).toBe("2026-08-11");
  });

  it("has nothing to offer when no vendor will start there", () => {
    expect(combinedOfferedCheckOut("2026-08-11", [offer()])).toBeNull();
  });
});

describe("combinedFirstBookablePeriod", () => {
  it("takes the earliest start any vendor will sell", () => {
    const period = combinedFirstBookablePeriod("2026-08-09", [
      offer(),
      offer({ offerId: "loff_flex", providerCode: "booking_manager", rules: [ANY_DAY_MIN_3] }),
    ]);
    expect(period).toEqual({
      startDate: "2026-08-09",
      endDate: "2026-08-12",
      offerId: "loff_flex",
    });
  });

  it("names the shorter charter when two vendors start on the same day", () => {
    const period = combinedFirstBookablePeriod(SATURDAY, [
      offer(),
      offer({ offerId: "loff_flex", rules: [ANY_DAY_MIN_3] }),
    ]);
    expect(period?.offerId).toBe("loff_flex");
    expect(period?.endDate).toBe("2026-08-11");
  });

  it("is null when nothing is on sale", () => {
    expect(combinedFirstBookablePeriod(SATURDAY, [offer({ priced: [] })])).toBeNull();
  });
});
