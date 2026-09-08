import type { ListingSearchDoc } from "@yacht-charter/db/search";

import { describe, expect, it } from "vitest";

import { badgesFor, presentListingSummary } from "./listing";

const doc = (over: Partial<ListingSearchDoc> = {}): ListingSearchDoc => ({
  listingId: "ylst_1",
  slug: "liburna-sunseeker",
  name: "Liburna",
  title: "Liburna Sunseeker",
  category: "Motor yacht",
  crewType: "full_crew",
  builder: "Sunseeker",
  model: "Predator 60",
  modelCanonical: "Predator 60",
  operator: "Alimos Charter",
  operatorTermsAndConditions: null,
  baseId: "base_1",
  baseName: "Alimos Marina",
  city: "Athens",
  location: "Alimos",
  region: "Attica",
  country: "Greece",
  lat: null,
  lng: null,
  baseEmail: null,
  basePhone: null,
  baseWebsite: null,
  baseCheckInTime: "17:00",
  baseCheckOutTime: "09:00",
  lengthM: "15.50",
  cabins: 3,
  berths: 6,
  heads: 2,
  showers: 3,
  yearBuilt: 2023,
  sailType: null,
  securityDepositMinor: 310_000,
  securityDepositCurrency: "EUR",
  securityDepositWhenInsuredMinor: null,
  depositInsuranceIncluded: true,
  petsAllowed: false,
  bestValue: false,
  rating: "5.00",
  reviewCount: 4,
  bookedThisMonth: 0,
  viewedToday: 2,
  mainImage: null,
  gallery: [],
  amenities: [],
  bestOfferId: "loff_1",
  offerCount: 1,
  priceFromMinor: 1_240_000,
  priceIsFrom: false,
  listPriceFromMinor: null,
  currency: "EUR",
  priceFromMinorEur: 1_240_000,
  basePriceFromMinor: 1_000_000,
  basePriceFromMinorEur: 1_000_000,
  availableFrom: "2026-06-13",
  availableTo: "2026-08-29",
  bookableFrom: null,
  bookableTo: null,
  hasUnconfirmedAvailability: false,
  hasTemporaryBooking: false,
  sellsRequestedPeriod: true,
  nearestCheckIn: null,
  nearestCheckOut: null,
  ...over,
});

describe("presentListingSummary", () => {
  it("quotes the provider's own deposit rather than a share of the price", () => {
    expect(presentListingSummary(doc()).priceDetails.securityDeposit).toEqual({
      amountMinor: 310_000,
      currency: "EUR",
    });
  });

  it("keeps the deposit in the currency it was taken in", () => {
    const summary = presentListingSummary(doc({ securityDepositCurrency: "HRK" }));

    expect(summary.priceFrom?.currency).toBe("EUR");
    expect(summary.priceDetails.securityDeposit?.currency).toBe("HRK");
  });

  it("falls back to the listing currency for a deposit that names none", () => {
    expect(
      presentListingSummary(doc({ securityDepositCurrency: null })).priceDetails.securityDeposit,
    ).toEqual({ amountMinor: 310_000, currency: "EUR" });
  });

  it("states no deposit for a provider that takes none, rather than zero", () => {
    expect(
      presentListingSummary(doc({ securityDepositMinor: null })).priceDetails.securityDeposit,
    ).toBeNull();
  });

  it("still reports the deposit for a listing with no usable price", () => {
    const summary = presentListingSummary(doc({ priceFromMinor: null }));

    expect(summary.priceFrom).toBeNull();
    expect(summary.priceDetails.securityDeposit?.amountMinor).toBe(310_000);
  });

  it("carries the undiscounted price for the card to strike through", () => {
    const summary = presentListingSummary(doc({ listPriceFromMinor: 1_500_000 }));

    expect(summary.listPriceFrom).toEqual({ amountMinor: 1_500_000, currency: "EUR" });
  });

  /* A struck figure with nothing beside it reads as the price, and a doubled one at that. */
  it("withholds the struck price from a listing with no price of its own", () => {
    const summary = presentListingSummary(
      doc({ priceFromMinor: null, listPriceFromMinor: 1_500_000 }),
    );

    expect(summary.priceFrom).toBeNull();
    expect(summary.listPriceFrom).toBeNull();
  });

  /*
   * The price and the dates are printed side by side on one card, so they have to describe one
   * charter. A four-night period captioned "7 days" is the bug this pins: the projection prices
   * the bookable week, not a nominal one.
   */
  it("captions the price with the bookable charter's own length", () => {
    const summary = presentListingSummary(
      doc({ bookableFrom: "2126-11-24", bookableTo: "2126-11-28" }),
    );

    expect(summary.availability.bookablePeriod).toEqual({
      checkIn: "2126-11-24",
      checkOut: "2126-11-28",
    });
    expect(summary.priceDetails.periodDays).toBe(4);
  });

  /*
   * The caption follows the figure, not the dates. A listing whose advertised charter came from
   * the projection's inferred branch has a legal period and no price for it, so the figure is
   * still the season's weekly floor -- captioning it with the period's own length described a
   * week's money as a single night's.
   */
  it("names the rate's own week when the price is only a floor", () => {
    const summary = presentListingSummary(
      doc({ bookableFrom: "2126-09-21", bookableTo: "2126-09-22", priceIsFrom: true }),
    );

    expect(summary.availability.bookablePeriod).toEqual({
      checkIn: "2126-09-21",
      checkOut: "2126-09-22",
    });
    expect(summary.priceDetails.periodDays).toBe(7);
  });

  it("names the rate's own week where no charter is bookable", () => {
    const summary = presentListingSummary(doc({ bookableFrom: null, bookableTo: null }));

    expect(summary.availability.bookablePeriod).toBeNull();
    expect(summary.priceDetails.periodDays).toBe(7);
  });

  /* A period already gone is dropped, so its length must not caption the price either. */
  it("falls back to the week when the bookable period has passed", () => {
    const summary = presentListingSummary(
      doc({ bookableFrom: "2020-11-24", bookableTo: "2020-11-28" }),
    );

    expect(summary.availability.bookablePeriod).toBeNull();
    expect(summary.priceDetails.periodDays).toBe(7);
  });

  /*
   * Today is inside every operator's notice period: the booking has to reach them and come
   * back confirmed before the base can hand the boat over. Advertising it put a departure a
   * few hours away behind a "Book" button.
   */
  it("drops a charter that checks in today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const summary = presentListingSummary(doc({ bookableFrom: today, bookableTo: "2126-11-28" }));

    expect(summary.availability.bookablePeriod).toBeNull();
  });

  it("keeps a charter that checks in tomorrow", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const summary = presentListingSummary(
      doc({ bookableFrom: tomorrow, bookableTo: "2126-11-28" }),
    );

    expect(summary.availability.bookablePeriod?.checkIn).toBe(tomorrow);
  });
});

describe("badgesFor", () => {
  /*
   * "Best value" used to be pushed onto every listing unconditionally, so all 18,655 cards in the
   * local catalogue carried it and it distinguished nothing. It is now earned in the read model.
   */
  it("withholds best value from a listing that has not earned it", () => {
    const codes = badgesFor({
      petsAllowed: false,
      depositInsuranceIncluded: false,
      rating: 4,
      bestValue: false,
    }).map((badge) => badge.code);

    expect(codes).not.toContain("best-value");
  });

  it("awards best value only where the read model marked it", () => {
    const codes = badgesFor({
      petsAllowed: false,
      depositInsuranceIncluded: false,
      rating: 4,
      bestValue: true,
    }).map((badge) => badge.code);

    expect(codes).toEqual(["best-value"]);
  });

  /* The booking snapshot froze before the flag existed and passes no value at all. */
  it("treats an absent flag as unearned rather than as true", () => {
    const codes = badgesFor({
      petsAllowed: false,
      depositInsuranceIncluded: false,
      rating: 5,
    }).map((badge) => badge.code);

    expect(codes).toEqual(["top-rated"]);
  });
});

describe("presentListingSummary on the charter rate", () => {
  it("headlines the all-in total by default and still names both figures", () => {
    const card = presentListingSummary(doc());
    expect(card.priceFrom?.amountMinor).toBe(1_240_000);
    expect(card.allInPriceFrom?.amountMinor).toBe(1_240_000);
    expect(card.basePriceFrom?.amountMinor).toBe(1_000_000);
  });

  it("headlines the rate when the catalogue is set to it, without hiding the total", () => {
    const card = presentListingSummary(doc(), "base");
    expect(card.priceFrom?.amountMinor).toBe(1_000_000);
    /* The client's condition for showing the rate: the extras move out of the headline, not
       out of the card. */
    expect(card.allInPriceFrom?.amountMinor).toBe(1_240_000);
  });

  it("falls back to the total where the rate is missing, rather than dropping the price", () => {
    const card = presentListingSummary(doc({ basePriceFromMinor: null }), "base");
    expect(card.priceFrom?.amountMinor).toBe(1_240_000);
    expect(card.basePriceFrom).toBeNull();
  });
});
