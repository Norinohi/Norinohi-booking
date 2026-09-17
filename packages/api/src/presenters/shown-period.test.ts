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
    expect(card.priceFrom).not.toBeNull();
  });

  it("prices nothing beside another week than the one it was quoted for", () => {
    const card = pricedForShownPeriod(
      doc(priced),
      { checkIn: "2099-06-20", checkOut: "2099-06-27" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
    expect(card.allInPriceFrom).toBeNull();
    expect(card.basePriceFrom).toBeNull();
    expect(card.listPriceFrom).toBeNull();
  });

  it("prices nothing beside a single night other than the one it was quoted for", () => {
    const card = pricedForShownPeriod(
      doc({ bookableFrom: "2099-06-06", bookableTo: "2099-06-07" }),
      { checkIn: "2099-06-20", checkOut: "2099-06-21" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
  });

  it("prices nothing beside a charter shorter than the week its price is for", () => {
    const card = pricedForShownPeriod(
      doc(priced),
      { checkIn: "2099-06-20", checkOut: "2099-06-23" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
    expect(card.basePriceFrom).toBeNull();
  });

  it("keeps a short charter's own price beside it", () => {
    const card = pricedForShownPeriod(
      doc({ bookableFrom: "2099-06-20", bookableTo: "2099-06-23" }),
      { checkIn: "2099-06-20", checkOut: "2099-06-23" },
      "base",
      ranks,
    );
    expect(card.priceFrom).not.toBeNull();
  });

  it("puts no season floor beside a charter shorter than a week", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, priceIsFrom: true }),
      { checkIn: "2099-06-20", checkOut: "2099-06-23" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
  });

  it("still reads as a floor where the price never priced a week", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, priceIsFrom: true }),
      { checkIn: "2099-06-20", checkOut: "2099-06-27" },
      "base",
      ranks,
    );
    expect(card.priceIsFrom).toBe(true);
    expect(card.priceFrom).not.toBeNull();
  });
  it("captions a week the operator's list priced as a list rate", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, pricedForDates: true, priceSource: "price-list" }),
      { checkIn: "2099-06-06", checkOut: "2099-06-13" },
      "base",
      ranks,
    );
    expect(card.priceFrom).not.toBeNull();
    expect(card.priceIsFrom).toBe(false);
    expect(card.priceSource).toBe("price-list");
  });

  it("keeps an estimate from the list for a charter of another length", () => {
    const card = pricedForShownPeriod(
      doc({
        ...priced,
        bookableTo: "2099-06-09",
        pricedForDates: true,
        priceSource: "price-list-estimate",
      }),
      { checkIn: "2099-06-06", checkOut: "2099-06-09" },
      "base",
      ranks,
    );
    expect(card.priceFrom).not.toBeNull();
    expect(card.priceIsFrom).toBe(false);
    expect(card.priceSource).toBe("price-list-estimate");
    expect(card.priceDetails.periodDays).toBe(3);
  });

  it("names the vendor behind a week it priced itself", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, pricedForDates: true, priceSource: "vendor" }),
      { checkIn: "2099-06-06", checkOut: "2099-06-13" },
      "base",
      ranks,
    );
    expect(card.priceSource).toBe("vendor");
  });

  it("keeps the price of the nearby week a flexible search shows instead", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, pricedForDates: true, pricedForNearbyDates: true, priceSource: "vendor" }),
      { checkIn: "2099-06-06", checkOut: "2099-06-13" },
      "base",
      ranks,
    );
    expect(card.priceFrom).not.toBeNull();
    expect(card.priceIsFrom).toBe(false);
    expect(card.priceSource).toBe("vendor");
  });

  it("captions a nearby week priced from the list as a list rate", () => {
    const card = pricedForShownPeriod(
      doc({
        ...priced,
        pricedForDates: true,
        pricedForNearbyDates: true,
        priceSource: "price-list",
      }),
      { checkIn: "2099-06-06", checkOut: "2099-06-13" },
      "base",
      ranks,
    );
    expect(card.priceFrom).not.toBeNull();
    expect(card.priceSource).toBe("price-list");
  });

  it("prices nothing where the search priced a nearby week but the card names another", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, pricedForDates: true, pricedForNearbyDates: true, priceSource: "vendor" }),
      { checkIn: "2099-06-03", checkOut: "2099-06-10" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
    expect(card.priceSource).toBeNull();
  });

  it("puts no season floor beside a dated week nobody priced", () => {
    const card = pricedForShownPeriod(
      doc({ ...priced, priceIsFrom: true, pricedForDates: false, priceSource: null }),
      { checkIn: "2099-06-20", checkOut: "2099-06-27" },
      "base",
      ranks,
    );
    expect(card.priceFrom).toBeNull();
    expect(card.allInPriceFrom).toBeNull();
    expect(card.priceSource).toBeNull();
  });
});
