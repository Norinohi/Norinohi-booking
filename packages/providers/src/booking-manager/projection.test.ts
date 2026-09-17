import { describe, expect, it } from "vitest";

import type { JsonValue } from "../shared/json";
import type { ProviderRecordSet, ProviderResourceType } from "../types";
import { projectBookingManagerCatalogue } from "./projection";

function records(countries: unknown[]): ProviderRecordSet {
  return new Map([
    [
      "country" as const,
      countries.map((payload, index) => ({ externalId: String(index), payload })),
    ],
  ]);
}

/**
 * The Swagger declares the ISO fields as `short`/`long`; the worked example in the
 * vendor's integration guide returns `shortName`/`longName`. The schemas are loose,
 * so reading only one spelling would not throw. It would silently drop every
 * country code, and that code is what merges a country across providers.
 */
describe("country codes across both vendor spellings", () => {
  it("reads the Swagger spelling", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", short: "IT", long: "ITA", worldRegion: 16 }]),
    );

    expect(countries).toEqual([{ externalId: "380", code: "IT", name: "Italy" }]);
  });

  it("reads the integration-guide spelling", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", shortName: "IT", longName: "ITA", worldRegion: 16 }]),
    );

    expect(countries).toEqual([{ externalId: "380", code: "IT", name: "Italy" }]);
  });

  it("falls back to a namespaced code only when neither spelling carries one", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, name: "Italy", worldRegion: 16 }]),
    );

    expect(countries[0]?.code).toBe("booking_manager-380");
  });

  it("names a country from longName when name is absent", () => {
    const { countries } = projectBookingManagerCatalogue(
      records([{ id: 380, shortName: "IT", longName: "ITA", worldRegion: 16 }]),
    );

    expect(countries[0]?.name).toBe("ITA");
  });
});

/**
 * The vendor hangs priced extras off a yacht's products. They are the catalogue's
 * only source for the listing's mandatory and optional extras sections; the
 * equipment lists say what the yacht carries, not what it costs to add.
 */
/**
 * The vendor publishes a cancellation policy in exactly one place - inside the
 * company's `termsAndConditions` - and the checkout asks the guest to accept it,
 * so losing it here means asking someone to agree to a document we never show.
 */
describe("operator terms and conditions", () => {
  function companies(payload: JsonValue): ProviderRecordSet {
    return new Map([["company" as const, [{ externalId: "1", payload }]]]);
  }

  it("carries the company terms onto the operator", () => {
    const { operators } = projectBookingManagerCatalogue(
      companies({ id: 225, name: "Adriatic Charter", termsAndConditions: "1. CHARTER FEE ..." }),
    );

    expect(operators[0]?.termsAndConditions).toBe("1. CHARTER FEE ...");
  });

  it("leaves the field unset for the operators that publish none", () => {
    const { operators } = projectBookingManagerCatalogue(
      companies({ id: 225, name: "Adriatic Charter" }),
    );

    expect(operators[0]?.termsAndConditions).toBeUndefined();
  });
});

describe("product extras", () => {
  /** Only the fields projectYacht needs to keep the boat, plus the products under test. */
  const yacht = (products: JsonValue[]) => ({
    id: 5001,
    companyId: 42,
    homeBaseId: 7,
    name: "Aurora",
    currency: "EUR",
    products,
  });

  function yachtRecords(payload: ReturnType<typeof yacht>): ProviderRecordSet {
    return new Map([["yacht" as const, [{ externalId: String(payload.id), payload }]]]);
  }

  const listingOf = (products: JsonValue[]) =>
    projectBookingManagerCatalogue(yachtRecords(yacht(products))).listings[0];

  it("splits extras by the vendor's obligatory flag", () => {
    const listing = listingOf([
      {
        isDefaultProduct: true,
        extras: [
          { id: 1, name: "Final cleaning", obligatory: true, price: 125, currency: "EUR" },
          { id: 2, name: "Outboard engine", obligatory: false, price: 90, currency: "EUR" },
        ],
      },
    ]);

    expect(listing?.extras).toEqual([
      expect.objectContaining({ externalId: "1", name: "Final cleaning", obligatory: true }),
      expect.objectContaining({ externalId: "2", name: "Outboard engine", obligatory: false }),
    ]);
  });

  /*
   * A fee stated as a share of the charter: the vendor fills `percentage` and leaves `price` at
   * zero. The quote path has always read it; the catalogue did not, so 335 obligatory fees on
   * 278 listings reached the card as free -- a crewed yacht advertised 56,500 EUR against a
   * quote of 76,501, the difference being an APA at 40%.
   */
  it("carries a percentage fee as a rate, not as the zero the vendor leaves in price", () => {
    const listing = listingOf([
      {
        isDefaultProduct: true,
        extras: [{ id: 3, name: "APA 40%", obligatory: true, kind: 0, price: 0, percentage: 40 }],
      },
    ]);

    expect(listing?.extras[0]).toMatchObject({
      externalId: "3",
      obligatory: true,
      percentage: 0.4,
      priceMinor: 0,
    });
  });

  /* A fee of nothing is money, not a share; both readings of zero leave it a price. */
  it("reads a zero percentage as a price rather than a rate", () => {
    const listing = listingOf([
      {
        isDefaultProduct: true,
        extras: [{ id: 4, name: "Welcome pack", price: 25, percentage: 0, currency: "EUR" }],
      },
    ]);

    expect(listing?.extras[0]?.percentage).toBeUndefined();
    expect(listing?.extras[0]?.priceMinor).toBe(2_500);
  });

  it("prices a repeated extra from the default product", () => {
    const extra = (price: number) => [{ id: 1, name: "Bedding", price, currency: "EUR" }];
    const listing = listingOf([
      { name: "Skippered", isDefaultProduct: false, extras: extra(60) },
      { name: "Bareboat", isDefaultProduct: true, extras: extra(40) },
    ]);

    expect(listing?.extras).toHaveLength(1);
    expect(listing?.extras[0]?.priceMinor).toBe(4_000);
  });

  it("drops an extra with no id or no name rather than publishing it unnamed", () => {
    const listing = listingOf([
      {
        isDefaultProduct: true,
        extras: [
          { name: "Nameless id", price: 10, currency: "EUR" },
          { id: 3, price: 10, currency: "EUR" },
          { id: 4, name: "Kept", price: 10, currency: "EUR" },
        ],
      },
    ]);

    expect(listing?.extras).toEqual([expect.objectContaining({ externalId: "4" })]);
  });

  it("falls back to the yacht's currency when an extra names none", () => {
    const listing = listingOf([
      { isDefaultProduct: true, extras: [{ id: 1, name: "Bedding", price: 40 }] },
    ]);

    expect(listing?.extras[0]?.priceCurrency).toBe("EUR");
  });

  it("publishes no extras for a yacht with no products", () => {
    expect(listingOf([])?.extras).toEqual([]);
  });
});

/**
 * Pinned to the live test fleet (company 225), not to the specification, which
 * documents no range for these fields.
 */
describe("check-in rules", () => {
  const yachtRecords = (payload: Record<string, JsonValue>): ProviderRecordSet =>
    new Map([["yacht" as const, [{ externalId: String(payload.id), payload }]]]);

  const rulesOf = (over: Record<string, JsonValue>) =>
    projectBookingManagerCatalogue(
      yachtRecords({ id: 5001, companyId: 225, homeBaseId: 7, name: "Zaffiro", ...over }),
    ).listings[0]?.checkinRules;

  it("reads day 7 as Saturday, the day the vendor actually turns boats around", () => {
    // Every yacht in the test fleet sends 7, and every booking in its availability
    // starts on a Saturday. ISO numbering would have made this Sunday and put every
    // synthesized week a day off the one the vendor sells.
    expect(
      rulesOf({ defaultCheckInDay: 7, allCheckInDays: [7], minimumCharterDuration: 7 }),
    ).toEqual([{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7, maxNights: undefined }]);
  });

  /*
   * The vendor writes "any day" as defaultCheckInDay -1 plus a full list. Measured against
   * /offers, such a yacht sells from every day at its stated minimum, so it is one rule with no
   * weekday rather than seven paired ones, or the Saturday this used to be narrowed to.
   */
  it("reads a yacht that takes every day as one rule with no weekday", () => {
    const rules = rulesOf({
      defaultCheckInDay: -1,
      allCheckInDays: [1, 2, 3, 4, 5, 6, 7],
      minimumCharterDuration: 3,
    });

    expect(rules).toEqual([
      { checkinWeekday: undefined, checkoutWeekday: undefined, minNights: 3, maxNights: undefined },
    ]);
  });

  it("lets a charter start and end on any of the days a yacht lists", () => {
    const rules = rulesOf({
      defaultCheckInDay: 7,
      allCheckInDays: [4, 7],
      minimumCharterDuration: 3,
    });

    expect(rules).toEqual([
      { checkinWeekday: 3, checkoutWeekday: 3, minNights: 3, maxNights: undefined },
      { checkinWeekday: 3, checkoutWeekday: 6, minNights: 3, maxNights: undefined },
      { checkinWeekday: 6, checkoutWeekday: 3, minNights: 3, maxNights: undefined },
      { checkinWeekday: 6, checkoutWeekday: 6, minNights: 3, maxNights: undefined },
    ]);
  });

  it("keeps the days a yacht offers when none of them is Saturday", () => {
    const rules = rulesOf({ defaultCheckInDay: -1, allCheckInDays: [2, 5] });

    expect([...new Set(rules?.map((rule) => rule.checkinWeekday))]).toEqual([1, 4]);
  });

  it("falls back to the default day when no list is sent", () => {
    expect(rulesOf({ defaultCheckInDay: 1 })?.[0]?.checkinWeekday).toBe(0);
  });

  it("keeps a minimum duration for a yacht with no usable weekday", () => {
    expect(rulesOf({ defaultCheckInDay: -1, minimumCharterDuration: 5 })).toEqual([
      { checkinWeekday: undefined, checkoutWeekday: undefined, minNights: 5, maxNights: undefined },
    ]);
  });
});

type Payload = { id: number } & Record<string, JsonValue>;

/** Keyed by vendor id, which is how the ingest files every record. */
const recordSet = (entries: [ProviderResourceType, Payload[]][]): ProviderRecordSet =>
  new Map(
    entries.map(([resourceType, payloads]) => [
      resourceType,
      payloads.map((payload) => ({ externalId: String(payload.id), payload })),
    ]),
  );

/*
 * The vendor files a country under a world region ("Southern Europe") and a base under sailing
 * areas. Only the sailing area is somewhere to sail, and migration 0128 moved the rows already
 * written to exactly these names, so the region and location naming is pinned here.
 */
describe("geography", () => {
  const geographyOf = (bases: Payload[]) =>
    projectBookingManagerCatalogue(
      recordSet([
        [
          "country",
          [
            { id: 191, name: "Croatia", shortName: "HR", worldRegion: 39 },
            { id: 499, name: "Montenegro", shortName: "ME", worldRegion: 39 },
          ],
        ],
        ["region", [{ id: 39, name: "Southern Europe" }]],
        [
          "location",
          [
            { id: 3, name: "Split" },
            { id: 9, name: "Dubrovnik / Montenegro" },
          ],
        ],
        ["base", bases],
      ]),
    );

  it("names the region after the base's sailing area, never the world region", () => {
    const { regions, locations, bases } = geographyOf([
      { id: 1, name: "ACI Marina Split", countryId: 191, sailingAreas: [3] },
    ]);

    expect(regions).toEqual([
      { externalId: "region:3:191", externalCountryId: "191", name: "Split" },
    ]);
    expect(locations).toEqual([
      { externalId: "location:3:191", externalRegionId: "region:3:191", name: "Split" },
    ]);
    expect(bases[0]?.externalLocationId).toBe("location:3:191");
  });

  it("splits a sailing area that crosses a border into one region per country", () => {
    const { regions } = geographyOf([
      { id: 1, name: "Port Gruž", countryId: 191, sailingAreas: [9] },
      { id: 2, name: "Porto Montenegro", countryId: 499, sailingAreas: [9] },
    ]);

    expect(regions.map((item) => [item.externalCountryId, item.name])).toEqual([
      ["191", "Dubrovnik / Montenegro"],
      ["499", "Dubrovnik / Montenegro"],
    ]);
  });

  it("falls back to the country for a base with no sailing area", () => {
    const { regions, locations } = geographyOf([
      { id: 1, name: "Marina Punat", countryId: 191, sailingAreas: [] },
    ]);

    expect(regions).toEqual([
      { externalId: "region:191", externalCountryId: "191", name: "Croatia" },
    ]);
    expect(locations[0]?.name).toBe("Croatia");
  });
});

describe("placeholder shipyards", () => {
  it("leaves a yacht filed under a shipyard called Unknown without a builder", () => {
    const yacht = { companyId: 225, homeBaseId: 7 };
    const catalogue = projectBookingManagerCatalogue(
      recordSet([
        [
          "builder",
          [
            { id: 1, name: "Unknown" },
            { id: 2, name: "Bavaria" },
          ],
        ],
        [
          "yacht",
          [
            { ...yacht, id: 5001, name: "Nobody", model: "One-off", shipyardId: 1 },
            { ...yacht, id: 5002, name: "Zaffiro", model: "Cruiser 46", shipyardId: 2 },
          ],
        ],
      ]),
    );

    expect(catalogue.builders.map((item) => item.name)).toEqual(["Bavaria"]);
    expect(catalogue.listings.map((item) => item.externalBuilderId)).toEqual([undefined, "2"]);
    expect(catalogue.models.map((item) => item.externalBuilderId)).toEqual([undefined, "2"]);
  });
});
