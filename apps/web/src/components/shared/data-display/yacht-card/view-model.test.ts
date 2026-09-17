import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "../../../../../messages/en";

import {
  amenityItems,
  amenityOverflow,
  bookingMarina,
  type MoneyFormatter,
  yachtCardExtras,
  yachtCardIdentity,
  yachtCardListPrice,
  yachtCardPrice,
  type YachtCardListing,
  yachtSpecs,
} from "./view-model";

const t = createTranslator({ locale: "en", messages, namespace: "Common.boatCard" });
const tCrew = createTranslator({ locale: "en", messages, namespace: "Common.crewTypes" });
const tBadge = createTranslator({ locale: "en", messages, namespace: "Common.boatCard.badges" });

const money: MoneyFormatter = (amountMinor, currency = "EUR") =>
  `${currency} ${(amountMinor / 100).toFixed(2)}`;

const eur = (amountMinor: number) => ({ amountMinor, currency: "EUR" });

const SPECS = {
  lengthM: 12.5,
  cabins: 4,
  berths: 8,
  heads: 2,
  showers: null,
  yearBuilt: 2019,
  sailType: "roller-furling",
  hasMainsail: true,
};

const LISTING: YachtCardListing = {
  id: "listing_1",
  title: "Bavaria 46",
  gallery: [],
  mainImage: "main.jpg",
  rating: 0,
  category: "Sailing yacht",
  crewType: "bareboat",
  specs: SPECS,
  amenities: ["Wi-Fi", "Dinghy", "Anchor winch", "Generator", "Autopilot", "Bimini"],
  badges: [
    { code: "best-value", label: "Best value" },
    { code: "mystery", label: "Mystery" },
  ],
};

describe("amenities", () => {
  const labels = ["Wi-Fi", "Dinghy", "Generator", "Autopilot", "Watermaker", "Bimini"];

  it("shows four and puts the rest behind the overflow", () => {
    expect(amenityItems(labels).map((item) => item.label)).toEqual(labels.slice(0, 4));
    expect(amenityOverflow(labels).map((item) => item.label)).toEqual(["Watermaker", "Bimini"]);
  });

  it("has no overflow for a short list", () => {
    expect(amenityOverflow(labels.slice(0, 3))).toEqual([]);
  });
});

describe("yachtSpecs", () => {
  it("omits showers the provider never stated", () => {
    const labels = yachtSpecs(t, SPECS).map((spec) => spec.label);

    expect(labels).not.toContain("Showers");
    expect(labels).toEqual(["Year", "People", "Toilets", "Mainsail type", "Cabins", "Length"]);
  });

  it("includes a stated shower count, even zero", () => {
    const showers = yachtSpecs(t, { ...SPECS, showers: 0 }).find(
      (spec) => spec.label === "Showers",
    );

    expect(showers?.value).toBe("0");
  });

  it("labels the sail type, falling back to a batten mainsail", () => {
    const sail = (sailType: string | null) =>
      yachtSpecs(t, { ...SPECS, sailType }).find((spec) => spec.label === "Mainsail type")?.value;

    expect(sail("roller-furling")).toBe("Roller furling");
    expect(sail(null)).toBe("Batten mainsail");
  });

  it("has no mainsail row for a motor boat the vendor gave no sail type", () => {
    const labels = yachtSpecs(t, { ...SPECS, sailType: null, hasMainsail: false }).map(
      (spec) => spec.label,
    );

    expect(labels).toEqual(["Year", "People", "Toilets", "Cabins", "Length"]);
  });
});

describe("yachtCardPrice", () => {
  it("formats a price in its own currency", () => {
    const listing = {
      priceFrom: { amountMinor: 761_900, currency: "USD" },
      availability: { hasAvailableDates: true },
    };

    expect(yachtCardPrice(t, listing, money)).toBe("USD 7619.00");
  });

  it("reads on request with dates but no price, unavailable with neither", () => {
    expect(
      yachtCardPrice(t, { priceFrom: null, availability: { hasAvailableDates: true } }, money),
    ).toBe("On request");
    expect(
      yachtCardPrice(t, { priceFrom: null, availability: { hasAvailableDates: false } }, money),
    ).toBe("Unavailable");
  });
});

describe("yachtCardListPrice", () => {
  const availability = { hasAvailableDates: true };

  it("strikes a higher list price", () => {
    expect(
      yachtCardListPrice(
        { priceFrom: eur(90_000), listPriceFrom: eur(100_000), availability },
        money,
      ),
    ).toBe("EUR 1000.00");
  });

  it("has nothing to strike when list is not above price", () => {
    expect(
      yachtCardListPrice(
        { priceFrom: eur(100_000), listPriceFrom: eur(100_000), availability },
        money,
      ),
    ).toBeUndefined();
    expect(
      yachtCardListPrice({ priceFrom: eur(100_000), listPriceFrom: null, availability }, money),
    ).toBeUndefined();
  });

  it("compares after splitting, so a sub-unit discount vanishes", () => {
    const listing = { priceFrom: eur(70_000), listPriceFrom: eur(70_003), availability };

    expect(yachtCardListPrice(listing, money, 7)).toBeUndefined();
    expect(yachtCardListPrice({ ...listing, listPriceFrom: eur(70_700) }, money, 7)).toBe(
      "EUR 101.00",
    );
  });
});

describe("yachtCardExtras", () => {
  const availability = { hasAvailableDates: true };

  it("states what the obligatory extras add", () => {
    const listing = { priceFrom: eur(100_000), allInPriceFrom: eur(125_000), availability };

    expect(yachtCardExtras(t, listing, money)).toBe("plus EUR 250.00 obligatory extras");
    expect(yachtCardExtras(t, listing, money, 5)).toBe("plus EUR 50.00 obligatory extras");
  });

  it("says nothing when the headline is already all-in", () => {
    expect(
      yachtCardExtras(
        t,
        { priceFrom: eur(100_000), allInPriceFrom: eur(100_000), availability },
        money,
      ),
    ).toBeUndefined();
    expect(yachtCardExtras(t, { priceFrom: eur(100_000), availability }, money)).toBeUndefined();
  });
});

describe("yachtCardIdentity", () => {
  it("falls back to the main image and drops an unscored rating", () => {
    const card = yachtCardIdentity(t, tCrew, tBadge, LISTING);

    expect(card.images).toEqual(["main.jpg"]);
    expect(card.rating).toBeUndefined();
    expect(yachtCardIdentity(t, tCrew, tBadge, { ...LISTING, rating: 4.6 }).rating).toBe("4.6");
    expect(yachtCardIdentity(t, tCrew, tBadge, { ...LISTING, mainImage: null }).images).toEqual([]);
  });

  it("prefers the gallery over the main image", () => {
    expect(
      yachtCardIdentity(t, tCrew, tBadge, { ...LISTING, gallery: ["a.jpg", "b.jpg"] }).images,
    ).toEqual(["a.jpg", "b.jpg"]);
  });

  it("translates a known crew code and badge, keeping unknown English", () => {
    const card = yachtCardIdentity(t, tCrew, tBadge, LISTING);

    expect(card.crew).toBe("Bareboat");
    expect(yachtCardIdentity(t, tCrew, tBadge, { ...LISTING, crewType: "Flotilla" }).crew).toBe(
      "Flotilla",
    );
    expect(card.badges.map((badge) => badge.label)).toEqual(["Best value", "Mystery"]);
  });

  it("counts overflow only from the curated list", () => {
    expect(yachtCardIdentity(t, tCrew, tBadge, LISTING).amenitiesOverflow).toBeUndefined();

    const curated = yachtCardIdentity(t, tCrew, tBadge, {
      ...LISTING,
      highlightAmenities: ["Wi-Fi", "Dinghy", "Generator", "Autopilot", "Watermaker"],
    });
    expect(curated.amenities.map((item) => item.label)).toEqual([
      "Wi-Fi",
      "Dinghy",
      "Generator",
      "Autopilot",
    ]);
    expect(curated.amenitiesOverflow?.map((item) => item.label)).toEqual(["Watermaker"]);
  });

  it("drops zero booking stats", () => {
    expect(
      yachtCardIdentity(t, tCrew, tBadge, {
        ...LISTING,
        bookingStats: { bookedThisMonth: 0, viewedToday: 0 },
      }).stats,
    ).toBeUndefined();

    const stats = yachtCardIdentity(t, tCrew, tBadge, {
      ...LISTING,
      bookingStats: { bookedThisMonth: 0, viewedToday: 3 },
    }).stats;
    expect(stats).toEqual([{ kind: "viewed", label: "3 people viewed today" }]);
  });
});

describe("bookingMarina", () => {
  it("maps a booking base snapshot onto the marina shape", () => {
    expect(
      bookingMarina("base_1", {
        name: "ACI Split",
        address: "Uvala Baluni 8",
        locationName: "Split",
        countryName: "Croatia",
        phone: null,
        website: "https://aci.hr",
        email: null,
        coordinates: { lat: 43.5, lng: 16.43 },
      }),
    ).toEqual({
      id: "base_1",
      name: "ACI Split",
      address: "Uvala Baluni 8",
      city: "Split",
      country: "Croatia",
      phone: undefined,
      website: "https://aci.hr",
      email: undefined,
      coordinates: { lat: 43.5, lng: 16.43 },
    });
  });
});
