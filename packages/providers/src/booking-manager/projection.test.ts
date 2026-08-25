import { describe, expect, it } from "vitest";

import type { JsonValue } from "../shared/json";
import type { ProviderRecordSet } from "../types";
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

  it("narrows a yacht that claims every day to the turnaround we can price", () => {
    /*
     * The vendor writes this as defaultCheckInDay -1 plus a full list, and taking it
     * literally is what broke listing five-o-sun-odyssey-509: seven paired rules, a
     * charter-period line naming all seven, and mid-week starts on the calendar that
     * /offers refused because /prices is only ever swept Saturday to Saturday.
     */
    const rules = rulesOf({
      defaultCheckInDay: -1,
      allCheckInDays: [1, 2, 3, 4, 5, 6, 7],
      minimumCharterDuration: 0,
    });

    expect(rules).toEqual([
      { checkinWeekday: 6, checkoutWeekday: 6, minNights: undefined, maxNights: undefined },
    ]);
  });

  it("keeps the days a yacht offers when none of them is the turnaround", () => {
    // No rate behind either day, so inventing a Saturday would be a different lie.
    const rules = rulesOf({ defaultCheckInDay: -1, allCheckInDays: [2, 5] });

    expect(rules?.map((rule) => rule.checkinWeekday)).toEqual([1, 4]);
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
