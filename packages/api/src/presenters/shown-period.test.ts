import { describe, expect, it } from "vitest";

import { doc } from "./listing.fixture";
import { pricedForShownPeriod } from "./shown-period";

const ranks = new Map<string, number>();

/* Far enough ahead that the lead-time floor never retires it while this suite still runs. */
const priced = { bookableFrom: "2099-06-06", bookableTo: "2099-06-13" };

describe("pricedForShownPeriod", () => {
  it("keeps the price plain beside the week it was quoted for", () => {
    const card = pricedForShownPeriod(
      doc(priced),
      { checkIn: "2099-06-06", checkOut: "2099-06-13" },
      "base",
      ranks,
    );
    expect(card.priceIsFrom).toBe(false);
    expect(card.pricedPeriod).toBeNull();
  });

  it("names the quoted week beside other dates instead of calling it a seasonal minimum", () => {
    const card = pricedForShownPeriod(
      doc(priced),
      { checkIn: "2099-06-20", checkOut: "2099-06-27" },
      "base",
      ranks,
    );
    expect(card.priceIsFrom).toBe(false);
    expect(card.pricedPeriod).toEqual({ checkIn: "2099-06-06", checkOut: "2099-06-13" });
  });

  it("still reads as a floor where the price never priced a week", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, priceIsFrom: true }),
      { checkIn: "2099-06-20", checkOut: "2099-06-27" },
      "base",
      ranks,
    );
    expect(card.priceIsFrom).toBe(true);
    expect(card.pricedPeriod).toBeNull();
  });
});
