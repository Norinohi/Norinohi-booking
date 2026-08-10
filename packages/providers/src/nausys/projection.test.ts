import { describe, expect, it } from "vitest";

import {
  canonicalCatalogueSchema,
  type ProviderRecordSet,
  type ProviderResourceType,
} from "../types";
import charterBases from "./fixtures/charterBases.json" with { type: "json" };
import charterCompanies from "./fixtures/charterCompanies.json" with { type: "json" };
import countries from "./fixtures/countries.json" with { type: "json" };
import equipment from "./fixtures/equipment.json" with { type: "json" };
import equipmentCategories from "./fixtures/equipmentCategories.json" with { type: "json" };
import locations from "./fixtures/locations.json" with { type: "json" };
import regions from "./fixtures/regions.json" with { type: "json" };
import yachtBuilders from "./fixtures/yachtBuilders.json" with { type: "json" };
import yachtCategories from "./fixtures/yachtCategories.json" with { type: "json" };
import yachtModels from "./fixtures/yachtModels.json" with { type: "json" };
import yachts102701 from "./fixtures/yachts-102701.json" with { type: "json" };
import { projectNausysCatalogue } from "./projection";

function recordSet(entries: Partial<Record<ProviderResourceType, unknown[]>>): ProviderRecordSet {
  const records: ProviderRecordSet = new Map();
  for (const [resourceType, payloads] of Object.entries(entries)) {
    records.set(
      resourceType as ProviderResourceType,
      (payloads ?? []).map((payload) => ({
        externalId: String((payload as { id?: unknown }).id),
        payload,
      })),
    );
  }
  return records;
}

function fixtureRecords(yachts: unknown[] = yachts102701.yachts): ProviderRecordSet {
  return recordSet({
    country: countries.countries,
    region: regions.regions,
    location: locations.locations,
    company: charterCompanies.companies,
    base: charterBases.bases,
    builder: yachtBuilders.builders,
    model: yachtModels.models,
    category: yachtCategories.categories,
    equipment_category: equipmentCategories.categories,
    amenity: equipment.equipment,
    yacht: yachts,
  });
}

const marlin = () => structuredClone(yachts102701.yachts[0]) as Record<string, unknown>;

describe("projectNausysCatalogue", () => {
  it("projects the recorded dump into a valid canonical catalogue", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(() => canonicalCatalogueSchema.parse(catalogue)).not.toThrow();
    expect(catalogue.listings).toHaveLength(2);
    expect(catalogue.countries.map((item) => item.code)).toEqual(["HR", "GR", "IT"]);
    expect(catalogue.operators[0]).toMatchObject({
      externalId: "102701",
      slug: "adriatic-sailing-d-o-o-102701",
      country: "Croatia",
      city: "Split",
    });
  });

  it("names bases after their operator and location, since the vendor sends none", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(catalogue.bases[0]).toMatchObject({
      externalId: "900101",
      externalLocationId: "53271",
      name: "Adriatic Sailing d.o.o. Split",
      lat: 43.5031,
      lng: 16.4315,
      checkInTime: "17:00",
    });
  });

  it("falls back from a missing EN text to the next locale the vendor sent", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    // Rijeka carries textHR only; Split carries textEN.
    expect(catalogue.locations.find((item) => item.externalId === "53401")?.name).toBe("Rijeka");
    expect(catalogue.locations.find((item) => item.externalId === "53271")?.name).toBe("Split");
    expect(catalogue.amenities.find((item) => item.externalId === "51020")?.name).toBe(
      "Splav za spasavanje",
    );
  });

  it("prefixes every external code with the provider key", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(catalogue.amenities.map((item) => item.code)).toContain("nausys:51001");
    expect(catalogue.categories.map((item) => item.code)).toContain("nausys:51");
  });

  it("keeps amenity references as vendor ids and drops unknown equipment", () => {
    const yacht = marlin();
    yacht.standardYachtEquipment = [{ equipmentId: 51001 }, { equipmentId: 999999 }];

    const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

    expect(listing?.amenities).toEqual(["51001"]);
  });

  describe("money", () => {
    it("converts decimal strings to minor units without parseFloat", () => {
      const cases: [string, number][] = [
        ["2000.00", 200_000],
        ["0.00", 0],
        ["3340.5", 334_050],
        ["3340.999", 334_099],
      ];

      for (const [deposit, expected] of cases) {
        const yacht = marlin();
        yacht.deposit = deposit;
        const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;
        expect(listing?.securityDepositMinor).toBe(expected);
      }
    });

    it("drops a malformed deposit instead of the yacht", () => {
      const yacht = marlin();
      yacht.deposit = "2 000,00 EUR";

      const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

      expect(listing?.externalId).toBe("4711001");
      expect(listing?.securityDepositMinor).toBeUndefined();
    });

    it("honours a currency the vendor sends and defaults to EUR otherwise", () => {
      const yacht = marlin();
      expect(projectNausysCatalogue(fixtureRecords([yacht])).listings[0]?.defaultCurrency).toBe(
        "EUR",
      );

      yacht.currency = "hrk";
      expect(projectNausysCatalogue(fixtureRecords([yacht])).listings[0]?.defaultCurrency).toBe(
        "HRK",
      );
    });
  });

  it("keeps a yacht that references an unknown model", () => {
    const yacht = marlin();
    yacht.yachtModelId = 999_999;

    const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

    expect(listing).toMatchObject({
      externalId: "4711001",
      title: "Marlin",
      externalModelId: undefined,
      externalBuilderId: undefined,
    });
    // Length falls back to the model's LOA when the yacht has one; here it does.
    expect(listing?.spec.lengthM).toBe(14.27);
  });

  it("drops a yacht with no base rather than inventing one", () => {
    const yacht = marlin();
    delete yacht.baseId;

    expect(projectNausysCatalogue(fixtureRecords([yacht])).listings).toHaveLength(0);
  });

  it("drops an unparseable yacht without losing the rest of the dump", () => {
    const broken = { ...marlin(), id: "not-a-number" };

    const catalogue = projectNausysCatalogue(fixtureRecords([broken, yachts102701.yachts[1]]));

    expect(catalogue.listings.map((item) => item.externalId)).toEqual(["4711002"]);
  });

  describe("slugs", () => {
    it("are stable across re-syncs", () => {
      const first = projectNausysCatalogue(fixtureRecords()).listings.map((item) => item.slug);
      const second = projectNausysCatalogue(fixtureRecords()).listings.map((item) => item.slug);

      expect(first).toEqual(second);
      expect(first[0]).toBe("marlin-bavaria-cruiser-46-4711001");
    });

    it("stay distinct for identically named yachts", () => {
      const twin = { ...marlin(), id: 4_711_009 };

      const slugs = projectNausysCatalogue(fixtureRecords([marlin(), twin])).listings.map(
        (item) => item.slug,
      );

      expect(new Set(slugs).size).toBe(2);
    });
  });

  describe("media", () => {
    it("assigns roles and keeps array order, deduplicating the main picture", () => {
      const [listing] = projectNausysCatalogue(fixtureRecords()).listings;

      expect(listing?.media).toEqual([
        {
          externalUrl: "https://ws.nausys.com/media/yacht/4711001/main.jpg",
          role: "main",
          sortOrder: 0,
        },
        {
          externalUrl: "https://ws.nausys.com/media/yacht/4711001/salon.jpg",
          role: "gallery",
          sortOrder: 1,
        },
        {
          externalUrl: "https://ws.nausys.com/media/yacht/4711001/cabin.jpg",
          role: "gallery",
          sortOrder: 2,
        },
      ]);
    });

    it("maps a layout image to the layout role", () => {
      const yacht = marlin();
      yacht.yachtLayoutPictureUrl = "https://ws.nausys.com/media/yacht/4711001/layout.png";

      const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

      expect(listing?.media.at(-1)).toEqual({
        externalUrl: "https://ws.nausys.com/media/yacht/4711001/layout.png",
        role: "layout",
        sortOrder: 3,
      });
    });
  });

  it("emits multilingual comments as listing texts", () => {
    const yacht = marlin();
    yacht.commentary = { textEN: "Well kept cruiser", textHR: "Dobro odrzana jedrilica" };
    yacht.conditions = { textHR: "Uvjeti najma" };

    const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

    expect(listing?.texts).toEqual([
      { kind: "description", locale: "en", value: "Well kept cruiser" },
      { kind: "description", locale: "hr", value: "Dobro odrzana jedrilica" },
      { kind: "conditions", locale: "hr", value: "Uvjeti najma" },
    ]);
  });

  it("maps check-in periods and one-way periods into rules", () => {
    const yacht = marlin();
    yacht.oneWayPeriods = [{ dateFrom: "04.04.2026", dateTo: "31.10.2026" }, { dateFrom: "bad" }];

    const [listing] = projectNausysCatalogue(fixtureRecords([yacht])).listings;

    expect(listing?.checkinRules).toEqual([
      { checkinWeekday: 6, checkoutWeekday: 6, minNights: 7, maxNights: undefined },
    ]);
    expect(listing?.oneWayRules).toEqual([
      { startDate: "2026-04-04", endDate: "2026-10-31", isOneWay: true },
    ]);
  });
});
