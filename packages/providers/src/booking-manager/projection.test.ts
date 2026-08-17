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
