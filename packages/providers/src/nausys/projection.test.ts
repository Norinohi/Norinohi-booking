import { describe, expect, it } from "vitest";
import { z } from "zod";

import { looseJsonObject } from "../shared/json";
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

/*
 * The fixtures are trimmed recordings of the live NauSYS catalogue, so every
 * assertion below is an assertion about the vendor's real shapes. Where a case
 * does not occur in the recording (a missing English name, a period that enables
 * two weekdays) the payload is built by hand and said to be built by hand.
 */

/**
 * Every recorded entity is a JSON object keyed by the vendor's own field names,
 * and the projection reads it field by field. Parsing the imported modules here
 * is the boundary that gives the fixtures that type.
 */
const payloadSchema = z.record(z.string(), z.json());
const payloadsSchema = z.array(payloadSchema);

type Payload = z.infer<typeof payloadSchema>;

const recorded = {
  country: payloadsSchema.parse(countries.countries),
  region: payloadsSchema.parse(regions.regions),
  location: payloadsSchema.parse(locations.locations),
  company: payloadsSchema.parse(charterCompanies.companies),
  base: payloadsSchema.parse(charterBases.bases),
  builder: payloadsSchema.parse(yachtBuilders.builders),
  model: payloadsSchema.parse(yachtModels.models),
  category: payloadsSchema.parse(yachtCategories.categories),
  equipment_category: payloadsSchema.parse(equipmentCategories.equipmentCategories),
  amenity: payloadsSchema.parse(equipment.equipment),
  yacht: payloadsSchema.parse(yachts102701.yachts),
};

function recordSet(entries: Partial<Record<ProviderResourceType, Payload[]>>): ProviderRecordSet {
  const records: ProviderRecordSet = new Map();
  for (const [resourceType, payloads] of Object.entries(entries)) {
    records.set(
      // SAFETY: Object.entries widens the key to string, and the parameter type
      // admits no key that is not a ProviderResourceType.
      resourceType as ProviderResourceType,
      (payloads ?? []).map((payload) => ({
        externalId: String(payload.id),
        payload,
      })),
    );
  }
  return records;
}

function fixtureRecords(
  yachts: Payload[] = recorded.yacht,
  overrides: Partial<Record<ProviderResourceType, Payload[]>> = {},
): ProviderRecordSet {
  return recordSet({ ...recorded, yacht: yachts, ...overrides });
}

function recordedYacht(index: number): Payload {
  const yacht = recorded.yacht[index];
  if (!yacht) throw new Error(`the recorded fleet has no yacht ${index}`);
  return structuredClone(yacht);
}

/** Sailing yacht, Saturday to Saturday, HTML highlights in three languages. */
const maria = () => recordedYacht(0);
/** Catamaran whose check-in period enables all seven weekdays. */
const kraken = () => recordedYacht(3);

const listingOf = (yacht: Payload) => projectNausysCatalogue(fixtureRecords([yacht])).listings[0];

describe("projectNausysCatalogue", () => {
  it("projects the recorded dump into a valid canonical catalogue", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(() => canonicalCatalogueSchema.parse(catalogue)).not.toThrow();
    expect(catalogue.listings).toHaveLength(6);
    expect(catalogue.countries[0]).toMatchObject({ code: "HR", name: "Croatia" });
    expect(catalogue.operators[0]).toMatchObject({
      externalId: "102701",
      // Provider-prefixed: the two vendors number their companies independently,
      // so an unprefixed `slug-1234` would collide with Booking Manager's company
      // 1234 and collapse two operators into one row.
      slug: "nausys-test-charter-company-102701",
      country: "Croatia",
      city: "Zagreb",
    });
  });

  it("names a base after its marina, not its operator, since the vendor sends no name", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(catalogue.bases.find((item) => item.externalId === "102751")).toMatchObject({
      externalLocationId: "57",
      name: "Dubrovnik, Komolac, ACI Marina Dubrovnik",
      lat: 42.6697,
      lng: 18.12461,
      checkInTime: "17:00",
      checkOutTime: "09:00",
    });
  });

  it("falls back from a missing EN text to the next locale the vendor sent", () => {
    // Every recorded name carries textEN, so the gap is made rather than found.
    const [first, ...rest] = payloadsSchema.parse(structuredClone(locations.locations));
    if (!first) throw new Error("the recording has no locations");
    const name = z.record(z.string(), z.string()).parse(first.name);
    delete name.textEN;
    first.name = name;

    const catalogue = projectNausysCatalogue(
      fixtureRecords(undefined, { location: [first, ...rest] }),
    );

    expect(catalogue.locations.find((item) => item.externalId === "53")?.name).toBe(
      "ACI Marina Rovinj",
    );
  });

  it("prefixes every external code with the provider key", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    expect(catalogue.amenities.map((item) => item.code)).toContain("nausys:17");
    expect(catalogue.categories.map((item) => item.code)).toContain("nausys:51");
  });

  it("drops equipment the vendor sends without a category", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    // amenity.amenity_category_id is NOT NULL; two of the recorded rows have none.
    expect(catalogue.amenities.map((item) => item.externalId)).not.toContain("73900002");
  });

  it("keeps amenity references as vendor ids and drops unknown equipment", () => {
    const yacht = maria();
    yacht.standardYachtEquipment = [
      { equipmentId: 17, quantity: 1, highlight: false, comment: {} },
      { equipmentId: 999_999, quantity: 1 },
    ];

    expect(listingOf(yacht)?.amenities).toEqual(["17"]);
  });

  describe("publication", () => {
    it("keeps a yacht the vendor has taken out of service out of the catalogue", () => {
      const yacht = maria();
      yacht.disabled = true;

      expect(projectNausysCatalogue(fixtureRecords([yacht])).listings).toHaveLength(0);
    });

    it("keeps a yacht the operator books by hand out of the catalogue", () => {
      const yacht = maria();
      yacht.internalUse = true;

      expect(projectNausysCatalogue(fixtureRecords([yacht])).listings).toHaveLength(0);
    });

    it("publishes a yacht that is not currently discounted", () => {
      const yacht = maria();
      yacht.onSale = false;

      expect(listingOf(yacht)?.externalId).toBe("479287");
    });

    it("drops a yacht with no base rather than inventing one", () => {
      const yacht = maria();
      delete yacht.baseId;

      expect(projectNausysCatalogue(fixtureRecords([yacht])).listings).toHaveLength(0);
    });

    it("drops an unparseable yacht without losing the rest of the dump", () => {
      const broken = { ...maria(), id: "not-a-number" };

      const catalogue = projectNausysCatalogue(fixtureRecords([broken, kraken()]));

      expect(catalogue.listings.map((item) => item.externalId)).toEqual(["22585866"]);
    });
  });

  describe("money", () => {
    it("reads the bare number the vendor sends as a deposit", () => {
      expect(listingOf(maria())?.securityDepositMinor).toBe(182_500);
    });

    it("scales the deposit by the currency the yacht names, not by EUR", () => {
      const yacht = maria();
      yacht.depositCurrency = "JPY";

      // Zero-exponent currency: 1825 yen is 1825 minor units, not 182 500.
      expect(listingOf(yacht)?.securityDepositMinor).toBe(1825);
    });

    it("takes the listing currency from the priced season", () => {
      const yacht = maria();
      const seasons = z
        .array(looseJsonObject({ prices: z.array(looseJsonObject({ currency: z.string() })) }))
        .parse(yacht.seasonSpecificData);
      for (const price of seasons[0]?.prices ?? []) price.currency = "USD";
      yacht.seasonSpecificData = seasons;

      const listing = listingOf(yacht);

      expect(listing?.defaultCurrency).toBe("USD");
      // The deposit keeps its own currency, which the vendor states separately.
      expect(listing?.securityDepositMinor).toBe(182_500);
    });

    it("drops a malformed deposit instead of the yacht", () => {
      const yacht = maria();
      yacht.deposit = "2 000,00 EUR";

      const listing = listingOf(yacht);

      expect(listing?.externalId).toBe("479287");
      expect(listing?.securityDepositMinor).toBeUndefined();
    });
  });

  describe("specification", () => {
    it("takes length and beam from the model, which is where the vendor keeps them", () => {
      expect(listingOf(maria())?.spec).toMatchObject({
        lengthM: 11.6,
        beamM: 6.3,
        draftM: 0.95,
        berths: 10,
        cabins: 6,
        heads: 2,
        yearBuilt: 2003,
      });
    });

    it("keeps a yacht that references an unknown model, dimensions and all", () => {
      const yacht = maria();
      yacht.yachtModelId = 999_999;

      expect(listingOf(yacht)).toMatchObject({
        externalId: "479287",
        title: "Maria's Pleasure",
        externalModelId: undefined,
        externalBuilderId: undefined,
        externalCategoryId: undefined,
        spec: { lengthM: 0 },
      });
    });

    it("reads a zero tank as unmeasured and falls through to the model", () => {
      const yacht = kraken();
      expect(listingOf(yacht)?.spec.fuelCapacity).toBe(300);

      yacht.fuelTank = 0;
      expect(listingOf(yacht)?.spec.fuelCapacity).toBe(600);
    });
  });

  describe("slugs", () => {
    it("are stable across re-syncs", () => {
      const first = projectNausysCatalogue(fixtureRecords()).listings.map((item) => item.slug);
      const second = projectNausysCatalogue(fixtureRecords()).listings.map((item) => item.slug);

      expect(first).toEqual(second);
      expect(first[0]).toBe("maria-s-pleasure-athena-38-479287");
    });

    it("stay distinct for identically named yachts", () => {
      const twin = { ...maria(), id: 479_288 };

      const slugs = projectNausysCatalogue(fixtureRecords([maria(), twin])).listings.map(
        (item) => item.slug,
      );

      expect(new Set(slugs).size).toBe(2);
    });
  });

  describe("media", () => {
    it("takes roles from the picture flags and files the main shot once", () => {
      const listing = listingOf(maria());

      // mainPictureUrl repeats the first entry of `pictures`; it must not be filed twice.
      expect(listing?.media).toEqual([
        {
          externalUrl:
            "https://ws.nausys.com/CBMS-external/rest/yachtModel/100239/pictures/main.jpg",
          role: "main",
          sortOrder: 0,
        },
        {
          externalUrl:
            "https://ws.nausys.com/CBMS-external/rest/yachtModel/100239/pictures/layout.jpg",
          role: "layout",
          sortOrder: 1,
        },
        {
          externalUrl:
            "https://ws.nausys.com/CBMS-external/rest/yacht/479287/pictures/10_Avanti.jpg",
          role: "gallery",
          sortOrder: 2,
        },
        {
          externalUrl:
            "https://ws.nausys.com/CBMS-external/rest/yacht/479287/pictures/Screenshot from 2026-04-24 10-12-07.png",
          role: "gallery",
          sortOrder: 3,
        },
        {
          externalUrl:
            "https://ws.nausys.com/CBMS-external/rest/yacht/479287/pictures/logo.svg.png",
          role: "gallery",
          sortOrder: 4,
        },
        {
          externalUrl: "https://ws.nausys.com/CBMS-external/rest/yacht/479287/pictures/summary.png",
          role: "gallery",
          sortOrder: 5,
        },
      ]);
    });

    it("falls back to picturesURL when the vendor sends no picture objects", () => {
      const yacht = maria();
      delete yacht.pictures;

      const listing = listingOf(yacht);

      expect(listing?.media).toHaveLength(6);
      expect(listing?.media.map((item) => item.role)).toEqual([
        "main",
        "gallery",
        "gallery",
        "gallery",
        "gallery",
        "gallery",
      ]);
    });

    it("leaves a yacht with no pictures at all without media", () => {
      // APOLLO carries neither mainPictureUrl nor any picture; it is recorded that way.
      const apollo = recordedYacht(4);

      expect(listingOf(apollo)?.media).toEqual([]);
    });
  });

  describe("texts", () => {
    it("strips the vendor's HTML out of every locale of the highlights", () => {
      expect(listingOf(maria())?.texts).toEqual([
        { kind: "description", locale: "en", value: "ana banana test\n\nevo baby blue boja" },
        { kind: "description", locale: "de", value: "ana banana test\n\nevo baby blue boja" },
        { kind: "description", locale: "hr", value: "ana banana test\n\nevo baby blue boja" },
      ]);
    });

    it("strips markup out of notes too", () => {
      // Recorded as "<mark>Yacht note</mark>" in EN, plain text in DE and HR.
      const kan = recordedYacht(1);

      expect(listingOf(kan)?.texts).toEqual([
        { kind: "notes", locale: "en", value: "Yacht note" },
        { kind: "notes", locale: "de", value: "Jacht bemerkung" },
        { kind: "notes", locale: "hr", value: "Napomena na plovilu" },
      ]);
    });

    it("decodes entities only after the tags are gone", () => {
      const yacht = maria();
      yacht.highlightsIntText = { textEN: "<p>Fish &amp; chips</p><p>&lt;script&gt;</p>" };

      expect(listingOf(yacht)?.texts).toEqual([
        { kind: "description", locale: "en", value: "Fish & chips\n<script>" },
      ]);
    });

    it("files the unlocalized highlights string under English", () => {
      const yacht = maria();
      delete yacht.highlightsIntText;
      yacht.highlights = "AC / Winch";

      expect(listingOf(yacht)?.texts).toEqual([
        { kind: "description", locale: "en", value: "AC / Winch" },
      ]);
    });

    it("emits nothing for a yacht whose text is markup and whitespace only", () => {
      const yacht = maria();
      yacht.highlightsIntText = { textEN: "<div>  </div>" };

      expect(listingOf(yacht)?.texts).toEqual([]);
    });
  });

  describe("check-in rules", () => {
    it("maps the named weekday booleans to one rule", () => {
      expect(listingOf(maria())?.checkinRules).toEqual([
        { checkinWeekday: 6, checkoutWeekday: 6, minNights: 7, maxNights: undefined },
      ]);
    });

    it("keeps a check-out weekday that differs from the check-in weekday", () => {
      // LeeLaa: Saturday in, Friday out, six nights.
      const leelaa = recordedYacht(2);

      expect(listingOf(leelaa)?.checkinRules).toEqual([
        { checkinWeekday: 6, checkoutWeekday: 5, minNights: 6, maxNights: undefined },
      ]);
    });

    it("reads all seven weekdays as no weekday constraint at all", () => {
      expect(listingOf(kraken())?.checkinRules).toEqual([
        {
          checkinWeekday: undefined,
          checkoutWeekday: undefined,
          minNights: 3,
          maxNights: undefined,
        },
      ]);
    });

    it("keeps every weekday a period enables rather than the first one", () => {
      // No recorded period enables a proper subset; this one is built by hand.
      const yacht = maria();
      yacht.checkInPeriods = [
        {
          checkInSaturday: true,
          checkInSunday: true,
          checkOutSaturday: true,
          dateFrom: "01.01.1970",
          dateTo: "31.12.2099",
          minimalReservationDuration: 7,
          minimumShortPeriodDuration: 3,
        },
      ];

      expect(listingOf(yacht)?.checkinRules).toEqual([
        { checkinWeekday: 0, checkoutWeekday: 6, minNights: 7, maxNights: undefined },
        { checkinWeekday: 6, checkoutWeekday: 6, minNights: 7, maxNights: undefined },
      ]);
    });

    it("collapses two periods that state the same rule over different dates", () => {
      const yacht = maria();
      const [period] = payloadsSchema.parse(yacht.checkInPeriods);
      yacht.checkInPeriods = [
        { ...period, dateFrom: "01.01.2026", dateTo: "31.12.2026" },
        { ...period, dateFrom: "01.01.2027", dateTo: "31.12.2027" },
      ];

      expect(listingOf(yacht)?.checkinRules).toHaveLength(1);
    });

    it("emits nothing for a period that constrains nothing", () => {
      const yacht = maria();
      yacht.checkInPeriods = [{ dateFrom: "01.01.1970", dateTo: "31.12.2099" }];

      expect(listingOf(yacht)?.checkinRules).toEqual([]);
    });
  });

  describe("euminia ratings", () => {
    /*
     * No yacht in the recorded company is rated (1 of 109 across the account is),
     * so every payload here is built by hand from what production sends for yacht
     * 102761 "Dali" and from the vendor PDF's examples.
     */

    it("reads the comma decimal separator production actually sends", () => {
      const yacht = maria();
      yacht.euminia = { total: "4,83", reviews: "6", recommendation: "100 %" };

      // parseFloat("4,83") is 4, which would understate the rating with no error.
      expect(listingOf(yacht)).toMatchObject({ rating: 4.83, reviewCount: 6 });
    });

    it("reads the period separator the vendor documents", () => {
      const yacht = maria();
      yacht.euminia = {
        cleanliness: "4.83",
        equipment: "4.79",
        personalService: "4.78",
        pricePerformance: "4.67",
        recommendation: "100 %",
        total: "4.79",
        reviews: "6",
      };

      const listing = listingOf(yacht);

      expect(listing).toMatchObject({ rating: 4.79, reviewCount: 6 });
      // Sub-scores have no canonical home yet; they stay in the retained raw payload.
      expect(listing).not.toHaveProperty("cleanliness");
    });

    it("leaves an unrated yacht unrated rather than rated zero", () => {
      const listing = listingOf(maria());

      expect(listing?.rating).toBeUndefined();
      expect(listing?.reviewCount).toBeUndefined();
    });

    it("drops a score outside the vendor's 0..5 scale instead of clamping it", () => {
      const yacht = maria();
      yacht.euminia = { total: "48,3", reviews: "6" };

      const listing = listingOf(yacht);

      // A wrong rating is worse than none, and the count goes with it: "0 (6 reviews)"
      // is a worse answer than silence.
      expect(listing?.rating).toBeUndefined();
      expect(listing?.reviewCount).toBeUndefined();
    });

    it("drops a score that does not parse", () => {
      const yacht = maria();
      yacht.euminia = { total: "n/a", reviews: "6" };

      expect(listingOf(yacht)?.rating).toBeUndefined();
    });

    it("keeps the rating when only the review count is unreadable", () => {
      const yacht = maria();
      yacht.euminia = { total: "4,00" };

      const listing = listingOf(yacht);

      expect(listing?.rating).toBe(4);
      expect(listing?.reviewCount).toBeUndefined();
    });

    it("keeps the yacht when the vendor changes the shape of the ratings", () => {
      const yacht = maria();
      yacht.euminia = { total: 4.79, reviews: 6 };

      expect(listingOf(yacht)).toMatchObject({ title: "Maria's Pleasure Athena 38" });
      expect(listingOf(yacht)?.rating).toBeUndefined();
    });
  });

  it("maps one-way periods from the vendor's periodFrom and periodTo", () => {
    const yacht = maria();
    yacht.oneWayPeriods = [
      { baseId: 102_753, locationId: 51, periodFrom: "04.04.2026", periodTo: "31.10.2026" },
      { baseId: 102_753, periodFrom: "not-a-date", periodTo: "31.10.2026" },
    ];

    expect(listingOf(yacht)?.oneWayRules).toEqual([
      { startDate: "2026-04-04", endDate: "2026-10-31", isOneWay: true },
    ]);
  });
});
