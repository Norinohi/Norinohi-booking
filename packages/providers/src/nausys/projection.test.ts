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
import services from "./fixtures/services.json" with { type: "json" };
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
  service: payloadsSchema.parse(services.services),
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

  it("keeps the vendor's own names for the locales the site serves", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());
    const propeller = catalogue.amenities.find((item) => item.externalId === "113410");

    expect(propeller?.name).toBe("3 blade folding propeller");
    expect(propeller?.translations).toEqual({
      de: "3-Blatt Faltpropeller",
      es: "Hélice plegable de 3 palas",
    });
  });

  it("leaves translations unset where none of the served locales are named", () => {
    const catalogue = projectNausysCatalogue(fixtureRecords());

    // uk is the case this has to express: NauSYS ships eighteen languages and none is it.
    for (const item of catalogue.amenities) {
      expect(item.translations?.uk).toBeUndefined();
    }
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
      // Carried alongside the amount: minor units are meaningless without it.
      expect(listingOf(yacht)?.securityDepositCurrency).toBe("JPY");
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
      expect(listing?.securityDepositCurrency).toBe("EUR");
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

    it("projects the shower count the vendor states, separately from the heads", () => {
      expect(listingOf(kraken())?.spec).toMatchObject({ heads: 4, showers: 4 });
    });

    /*
     * Five of the six recorded yachts carry `showers: 0` next to a non-zero `wc`,
     * which is the operator never filling the field in rather than a boat with no
     * shower. Publishing the zero would print "0 showers" on a yacht that has them.
     */
    it("reads a zero shower count as unstated", () => {
      expect(listingOf(maria())?.spec).toMatchObject({ heads: 2, showers: undefined });
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
        {
          checkinWeekday: 6,
          checkoutWeekday: 6,
          minNights: 7,
          maxNights: undefined,
          seasonStart: "1970-01-01",
          seasonEnd: "2099-12-31",
        },
      ]);
    });

    it("keeps a check-out weekday that differs from the check-in weekday", () => {
      // LeeLaa: Saturday in, Friday out, six nights.
      const leelaa = recordedYacht(2);

      expect(listingOf(leelaa)?.checkinRules).toEqual([
        {
          checkinWeekday: 6,
          checkoutWeekday: 5,
          minNights: 6,
          maxNights: undefined,
          seasonStart: "1970-01-01",
          seasonEnd: "2099-12-31",
        },
      ]);
    });

    it("reads all seven weekdays as no weekday constraint at all", () => {
      expect(listingOf(kraken())?.checkinRules).toEqual([
        {
          checkinWeekday: undefined,
          checkoutWeekday: undefined,
          minNights: 3,
          maxNights: undefined,
          seasonStart: "1970-01-01",
          seasonEnd: "2099-12-31",
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
        {
          checkinWeekday: 0,
          checkoutWeekday: 6,
          minNights: 7,
          maxNights: undefined,
          seasonStart: "1970-01-01",
          seasonEnd: "2099-12-31",
        },
        {
          checkinWeekday: 6,
          checkoutWeekday: 6,
          minNights: 7,
          maxNights: undefined,
          seasonStart: "1970-01-01",
          seasonEnd: "2099-12-31",
        },
      ]);
    });

    /*
     * These used to collapse into one rule, on the reading that the dates were noise. They are
     * not: an operator states its terms per season and lets them lapse, and one rule spanning
     * both seasons is a claim about the gap between them that nobody made.
     */
    it("keeps two periods that state the same rule over different seasons apart", () => {
      const yacht = maria();
      const [period] = payloadsSchema.parse(yacht.checkInPeriods);
      yacht.checkInPeriods = [
        { ...period, dateFrom: "01.01.2026", dateTo: "31.12.2026" },
        { ...period, dateFrom: "01.01.2027", dateTo: "31.12.2027" },
      ];

      expect(listingOf(yacht)?.checkinRules).toEqual([
        expect.objectContaining({ seasonStart: "2026-01-01", seasonEnd: "2026-12-31" }),
        expect.objectContaining({ seasonStart: "2027-01-01", seasonEnd: "2027-12-31" }),
      ]);
    });

    it("carries a season the operator let lapse rather than dropping its dates", () => {
      // Yacht 29476220's real shape: whole weeks, four months of three-night stays, whole weeks.
      const yacht = maria();
      const [period] = payloadsSchema.parse(yacht.checkInPeriods);
      yacht.checkInPeriods = [
        { ...period, dateFrom: "01.01.1970", dateTo: "31.12.2024" },
        {
          ...period,
          checkInMonday: true,
          checkInSunday: true,
          checkOutMonday: true,
          checkOutSunday: true,
          dateFrom: "01.01.2025",
          dateTo: "04.05.2025",
          minimalReservationDuration: 3,
        },
        { ...period, dateFrom: "05.05.2025", dateTo: "01.01.2999" },
      ];

      const rules = listingOf(yacht)?.checkinRules ?? [];
      const short = rules.filter((rule) => rule.minNights === 3);

      expect(short.length).toBeGreaterThan(0);
      for (const rule of short) {
        expect(rule).toMatchObject({ seasonStart: "2025-01-01", seasonEnd: "2025-05-04" });
      }
    });

    it("keeps a rule whose season is unreadable rather than dropping the turnaround", () => {
      const yacht = maria();
      const [period] = payloadsSchema.parse(yacht.checkInPeriods);
      yacht.checkInPeriods = [{ ...period, dateFrom: "not a date", dateTo: "31.12.2099" }];

      expect(listingOf(yacht)?.checkinRules).toEqual([
        expect.objectContaining({
          checkinWeekday: 6,
          seasonStart: undefined,
          seasonEnd: "2099-12-31",
        }),
      ]);
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

  /*
   * The catalogue's only source of priced extras. `standardYachtEquipment` carries
   * neither a price nor an obligatory flag, so before these were read every synced
   * listing published two empty extras sections and filed all 47 of its fittings
   * as included.
   */
  describe("extras", () => {
    it("carries the vendor's own name for the extra in every locale the site serves", () => {
      const listing = listingOf(maria());
      const cleaning = listing?.extras.find((extra) => extra.externalId === "52");

      expect(cleaning?.name).toBe("Final cleaning");
      expect(cleaning?.translations).toEqual({ de: "Endreinigung", es: "Limpieza final" });
    });

    it("reads the obligatory service the vendor prices on the season entry", () => {
      const listing = listingOf(maria());

      expect(listing?.extras).toContainEqual(
        expect.objectContaining({
          kind: "service",
          externalId: "52",
          name: "Final cleaning",
          obligatory: true,
          priceMinor: 12_500,
          priceCurrency: "EUR",
        }),
      );
    });

    it("files additional equipment as an optional extra, never as obligatory", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      // Hand-built: the trimmed equipment fixture covers the 27 ids the fleet is
      // fitted with, and none of the 10 the vendor sells as add-ons. Equipment 17
      // is `Autopilot`, recorded.
      yacht.seasonSpecificData = [
        {
          ...season,
          additionalYachtEquipment: [{ equipmentId: 17, price: "100.00", currency: "EUR" }],
        },
      ];

      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({
          kind: "equipment",
          externalId: "17",
          name: "Autopilot",
          obligatory: false,
          priceMinor: 10_000,
        }),
      );
    });

    /*
     * Not a fixture gap to paper over: the vendor prices add-ons the equipment
     * dump does not describe, and the same id resolving for one yacht and not
     * another is exactly the case the name filter exists for.
     */
    it("drops an add-on the equipment dump does not describe", () => {
      const extras = listingOf(maria())?.extras ?? [];

      expect(extras.filter((extra) => extra.kind === "equipment")).toEqual([]);
    });

    it("keeps standard equipment out of extras: it is fitted, not sold", () => {
      const listing = listingOf(maria());
      const serviceIds = new Set(
        (listing?.extras ?? []).filter((e) => e.kind === "service").map((e) => e.externalId),
      );

      expect(listing?.amenities.length).toBeGreaterThan(0);
      // The two id spaces are independent, so the only safe check is that the
      // equipment ids the yacht is fitted with are not republished as services.
      expect(listing?.amenities.some((id) => serviceIds.has(id))).toBe(false);
    });

    it("drops an extra whose id the catalogue cannot name", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      // Hand-built: every recorded serviceId but two resolves, and an unnamed extra
      // would reach the buyer as "Service 999999".
      yacht.seasonSpecificData = [
        { ...season, services: [{ serviceId: 999_999, price: "10.00", currency: "EUR" }] },
      ];

      const extras = listingOf(yacht)?.extras ?? [];

      expect(extras.filter((extra) => extra.kind === "service")).toEqual([]);
    });

    it("drops an extra the vendor withholds from the agency portal", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.seasonSpecificData = [
        {
          ...season,
          services: [
            {
              serviceId: 52,
              price: "125.00",
              currency: "EUR",
              obligatory: true,
              availableOnAgencyPortal: false,
            },
          ],
        },
      ];

      expect(listingOf(yacht)?.extras.filter((extra) => extra.kind === "service")).toEqual([]);
    });

    /** Maria's recorded home base, pinned so the cases below do not depend on it. */
    const HOME_BASE = 102_751;
    const cleaningService = (price: string) => [
      { serviceId: 52, price, currency: "EUR", obligatory: true },
    ];

    it("prices from the yacht's own base when the operator publishes several", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      // Hand-built: the recording gives each yacht one base. The vendor repeats the
      // whole extras list per base it sails the yacht from, at that base's prices.
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        { ...season, baseId: 999_999, services: cleaningService("500.00") },
        { ...season, baseId: HOME_BASE, services: cleaningService("125.00") },
      ];

      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({ externalId: "52", priceMinor: 12_500 }),
      );
    });

    it("keeps one entry per extra, taking the latest season's price", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        { ...season, seasonId: 1, baseId: HOME_BASE, services: cleaningService("100.00") },
        { ...season, seasonId: 2, baseId: HOME_BASE, services: cleaningService("150.00") },
      ];

      const cleaning = (listingOf(yacht)?.extras ?? []).filter((e) => e.externalId === "52");

      expect(cleaning).toHaveLength(1);
      expect(cleaning[0]?.priceMinor).toBe(15_000);
    });

    /*
     * The conditions the vendor files per price row rather than per extra. Ignoring them put a
     * fee on every card the operator only charges some of: 130,535 of its 184,539 priced rows
     * name the bases they apply at, 2,047 name a charter length.
     */
    it("carries the charter lengths a price is for, as nights", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        {
          ...season,
          baseId: HOME_BASE,
          services: [
            { serviceId: 52, price: "125.00", currency: "EUR", minDuration: 7, maxDuration: 13 },
          ],
        },
      ];

      /* The vendor counts the days the boat is held; a seven-night charter is eight of them. */
      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({ externalId: "52", validNightsFrom: 6, validNightsTo: 12 }),
      );
    });

    it("carries the dates a price applies to, so an expired one stops being shown", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        {
          ...season,
          baseId: HOME_BASE,
          services: [
            {
              serviceId: 52,
              price: "125.00",
              currency: "EUR",
              validPeriodFrom: "01.01.2026",
              validPeriodTo: "31.12.2026",
            },
          ],
        },
      ];

      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({
          externalId: "52",
          seasonStart: "2026-01-01",
          seasonEnd: "2026-12-31",
        }),
      );
    });

    it("carries the bases a price is charged at", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        {
          ...season,
          baseId: HOME_BASE,
          services: [
            { serviceId: 52, price: "125.00", currency: "EUR", validForBases: [HOME_BASE] },
          ],
        },
      ];

      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({ externalId: "52", validForBaseIds: [String(HOME_BASE)] }),
      );
    });

    /* Only one row per extra may be stored, so which one it is decides what the card charges. */
    it("keeps the row that applies at this base over a later one that does not", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        {
          ...season,
          seasonId: 1,
          baseId: HOME_BASE,
          services: [
            { serviceId: 52, price: "125.00", currency: "EUR", validForBases: [HOME_BASE] },
          ],
        },
        {
          ...season,
          seasonId: 2,
          baseId: HOME_BASE,
          services: [{ serviceId: 52, price: "500.00", currency: "EUR", validForBases: [999_999] }],
        },
      ];

      expect(listingOf(yacht)?.extras).toContainEqual(
        expect.objectContaining({ externalId: "52", priceMinor: 12_500 }),
      );
    });

    it("keeps the row whose window runs latest, which is never the expired one", () => {
      const yacht = maria();
      const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
      yacht.baseId = HOME_BASE;
      yacht.seasonSpecificData = [
        {
          ...season,
          seasonId: 2,
          baseId: HOME_BASE,
          services: [
            {
              serviceId: 52,
              price: "100.00",
              currency: "EUR",
              validPeriodFrom: "01.01.2024",
              validPeriodTo: "31.12.2024",
            },
          ],
        },
        {
          ...season,
          seasonId: 1,
          baseId: HOME_BASE,
          services: [
            {
              serviceId: 52,
              price: "150.00",
              currency: "EUR",
              validPeriodFrom: "01.01.2027",
              validPeriodTo: "31.12.2027",
            },
          ],
        },
      ];

      const cleaning = (listingOf(yacht)?.extras ?? []).filter((e) => e.externalId === "52");

      expect(cleaning).toHaveLength(1);
      expect(cleaning[0]?.priceMinor).toBe(15_000);
    });

    it("publishes no extras when the vendor sends no season data", () => {
      const yacht = maria();
      yacht.seasonSpecificData = [];

      expect(listingOf(yacht)?.extras).toEqual([]);
    });

    /*
     * NauSYS flags nothing as crew: a skipper is a priced service like any other and
     * the name is the only signal. Reading it wrong in either direction is costly, so
     * an unrecognised name stays a plain extra rather than becoming a role.
     */
    describe("crew roles read off the service name", () => {
      const serviceNamed = (id: number, name: string) => ({
        service: { id, name: { textEN: name } },
        priced: [{ serviceId: id, price: "500.00", currency: "EUR" }],
      });

      const roleFor = (name: string) => {
        const { service, priced } = serviceNamed(770_001, name);
        const yacht = maria();
        const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
        yacht.seasonSpecificData = [{ ...season, services: priced }];

        const catalogue = projectNausysCatalogue(
          fixtureRecords([yacht], { service: [...recorded.service, service] }),
        );
        return catalogue.listings[0]?.extras.find((extra) => extra.externalId === "770001")
          ?.crewRole;
      };

      it("recognises the roles the Crew control offers", () => {
        expect(roleFor("Skipper")).toBe("skipper");
        expect(roleFor("Captain")).toBe("skipper");
        expect(roleFor("Hostess")).toBe("hostess");
        expect(roleFor("Cook")).toBe("cook");
        expect(roleFor("Chef")).toBe("cook");
      });

      it("reads the more specific role when a name could match two", () => {
        expect(roleFor("Skippered charter with cook")).toBe("cook");
      });

      it("leaves an ordinary service alone rather than guessing", () => {
        expect(roleFor("Final cleaning")).toBeUndefined();
        expect(roleFor("Outboard engine")).toBeUndefined();
        expect(roleFor("Bed linen")).toBeUndefined();
      });
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

describe("the fields the vendor added in May 2025", () => {
  /*
   * A hull the operator has retired stays in the catalogue dump with the date it left. Nothing
   * about the sync notices, so the date rides on the listing and the publish step is what stops
   * selling it -- a projection has no clock, and a charter already booked has to stay readable.
   */
  it("carries the day the boat leaves the fleet", () => {
    const yacht = maria();
    yacht.outOfFleetDate = "19.09.2027";

    expect(listingOf(yacht)?.outOfFleetDate).toBe("2027-09-19");
  });

  it("turns a bare video id into a link, which is what the field actually holds", () => {
    const yacht = maria();
    yacht.youtubeVideos = "wxYl_sqVbtk";

    expect(listingOf(yacht)?.videoUrl).toBe("https://www.youtube.com/watch?v=wxYl_sqVbtk");
  });

  it("takes a full URL as the operator wrote it", () => {
    const yacht = maria();
    yacht.vimeoVideos = "https://vimeo.com/123456789";

    expect(listingOf(yacht)?.videoUrl).toBe("https://vimeo.com/123456789");
  });

  /* YouTube first: an operator that filled both meant the one most visitors can play. */
  it("prefers YouTube when the operator filled in both", () => {
    const yacht = maria();
    yacht.youtubeVideos = "wxYl_sqVbtk";
    yacht.vimeoVideos = "123456789";

    expect(listingOf(yacht)?.videoUrl).toBe("https://www.youtube.com/watch?v=wxYl_sqVbtk");
  });

  /* `linkFor360tour` holds a YouTube id on some fleets, which is not a tour. */
  it("keeps a 360 tour only when it is really a link", () => {
    const yacht = maria();
    yacht.linkFor360tour = "wxYl_sqVbtk";

    expect(listingOf(yacht)?.tourUrl).toBeUndefined();

    yacht.linkFor360tour = "https://tour.example.com/boat/1";
    expect(listingOf(yacht)?.tourUrl).toBe("https://tour.example.com/boat/1");
  });

  it("says nothing where the operator published nothing", () => {
    const listing = listingOf(maria());

    expect(listing?.outOfFleetDate).toBeUndefined();
    expect(listing?.videoUrl).toBeUndefined();
    expect(listing?.tourUrl).toBeUndefined();
  });
});

/*
 * Undocumented and on the wire: an operator can withhold a priced extra from named agencies.
 * 62 of 140,543 rows carry a list and every one of them is a deny list; none names us today,
 * which is exactly why the reading is narrow rather than clever.
 */
describe("extras an operator withholds from named agencies", () => {
  const HOME_BASE = 102_751;
  const withAgencies = (yacht: Payload, agencies: number[], excluded: boolean) => {
    const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
    yacht.baseId = HOME_BASE;
    yacht.seasonSpecificData = [
      {
        ...season,
        baseId: HOME_BASE,
        services: [
          {
            serviceId: 52,
            price: "125.00",
            currency: "EUR",
            obligatory: true,
            agencies,
            excludedAgencies: excluded,
          },
        ],
      },
    ];
    return yacht;
  };

  const cleaningIn = (catalogue: ReturnType<typeof projectNausysCatalogue>) =>
    (catalogue.listings[0]?.extras ?? []).filter((extra) => extra.externalId === "52");

  it("drops a row that names us on its deny list", () => {
    const yacht = withAgencies(maria(), [1_013_887, 49_209_547], true);
    const catalogue = projectNausysCatalogue(fixtureRecords([yacht]), { agencyId: "49209547" });

    expect(cleaningIn(catalogue)).toEqual([]);
  });

  it("keeps a row whose deny list names somebody else", () => {
    const yacht = withAgencies(maria(), [1_013_887, 1_259_561], true);
    const catalogue = projectNausysCatalogue(fixtureRecords([yacht]), { agencyId: "49209547" });

    expect(cleaningIn(catalogue)).toHaveLength(1);
  });

  /* A deployment that cannot say which agency it is must not guess that the row means it. */
  it("keeps the row when nobody configured our agency id", () => {
    const yacht = withAgencies(maria(), [49_209_547], true);
    const catalogue = projectNausysCatalogue(fixtureRecords([yacht]));

    expect(cleaningIn(catalogue)).toHaveLength(1);
  });

  /* An allow list is left alone: dropping an extra the operator does sell us is worse. */
  it("keeps a row whose list is not marked as an exclusion", () => {
    const yacht = withAgencies(maria(), [1_013_887], false);
    const catalogue = projectNausysCatalogue(fixtureRecords([yacht]), { agencyId: "49209547" });

    expect(cleaningIn(catalogue)).toHaveLength(1);
  });
});

/*
 * The vendor's rule is that the reduced deposit is "visible when different from regular
 * deposit", and the wire does not keep to it: 5,619 of our 7,343 hulls send a bare 0 and 404
 * send a figure that is not lower. Publishing either would tell a customer who bought deposit
 * insurance something the operator never said.
 */
describe("the deposit a charter with deposit insurance is held to", () => {
  it("publishes a real reduction", () => {
    const yacht = maria();
    yacht.deposit = 2500;
    yacht.depositWhenInsured = 550;

    expect(listingOf(yacht)?.securityDepositWhenInsuredMinor).toBe(55_000);
  });

  it("reads a zero as nothing published, not as a deposit of nothing", () => {
    const yacht = maria();
    yacht.deposit = 2500;
    yacht.depositWhenInsured = 0;

    expect(listingOf(yacht)?.securityDepositWhenInsuredMinor).toBeUndefined();
  });

  it("drops a figure that is not lower than the ordinary deposit", () => {
    const yacht = maria();
    yacht.deposit = 2500;
    yacht.depositWhenInsured = 2500;

    expect(listingOf(yacht)?.securityDepositWhenInsuredMinor).toBeUndefined();
  });
});

/*
 * A crew word in the name does not make the line that person's fee for the week. These are the
 * name families the fleet actually carries, counted across our own catalogue.
 */
describe("what counts as crew", () => {
  const serviceNamed = (name: string) => {
    const yacht = maria();
    const [season] = z.array(looseJsonObject({})).parse(yacht.seasonSpecificData);
    yacht.seasonSpecificData = [
      { ...season, services: [{ serviceId: 52, price: "1900.00", currency: "EUR" }] },
    ];
    /* The catalogue is what names a service, so the name under test goes there. */
    const records = fixtureRecords([yacht]);
    const services = records.get("service") ?? [];
    records.set("service", [
      ...services.filter((record) => record.externalId !== "52"),
      { externalId: "52", payload: { id: 52, name: { textEN: name } } },
    ]);
    return projectNausysCatalogue(records).listings[0]?.extras.find((e) => e.externalId === "52");
  };

  it("reads a plain skipper as the skipper", () => {
    expect(serviceNamed("Skipper")?.crewRole).toBe("skipper");
  });

  it("reads a captain as the same role, since operators use both words", () => {
    expect(serviceNamed("Captain")?.crewRole).toBe("skipper");
  });

  /* One hull advertised 15,050 EUR against a quote of 12,550: a course counted as the skipper. */
  it("does not read a sailing course as the skipper", () => {
    expect(serviceNamed("Skipper training practice")?.crewRole).toBeUndefined();
    expect(serviceNamed("Certification Skipper (ASA)")?.crewRole).toBeUndefined();
  });

  it("does not read the handover as the skipper", () => {
    expect(serviceNamed("Checkout Skipper")?.crewRole).toBeUndefined();
    expect(serviceNamed("Day Checkout Captain")?.crewRole).toBeUndefined();
  });

  it("does not read a surcharge or a cabin fee as crew", () => {
    expect(serviceNamed("Fun Pack skipper surcharge")?.crewRole).toBeUndefined();
    expect(
      serviceNamed("Additional fee for Skipper in forepeak & shared bathroom")?.crewRole,
    ).toBeUndefined();
  });

  it("does not read hourly hire as the week's skipper", () => {
    expect(serviceNamed("Captain By Day")?.crewRole).toBeUndefined();
    expect(serviceNamed("Short-term skipper (max 3 days)")?.crewRole).toBeUndefined();
  });

  it("still reads a cook and a hostess", () => {
    expect(serviceNamed("Cook")?.crewRole).toBe("cook");
    expect(serviceNamed("Hostess")?.crewRole).toBe("hostess");
  });
});
