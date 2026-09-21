import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseExactJson } from "../shared/exact-json";
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

  it("takes nothing from a product the listing does not sell", () => {
    const listing = listingOf([
      {
        name: "Bareboat",
        isDefaultProduct: true,
        extras: [{ id: 1, name: "Final cleaning", obligatory: true, price: 150 }],
      },
      {
        name: "Flotilla",
        isDefaultProduct: false,
        extras: [{ id: 2, name: "FL Flotilla package", obligatory: true, price: 800 }],
      },
      {
        name: "Crewed",
        isDefaultProduct: false,
        extras: [{ id: 3, name: "Skipper", obligatory: true, price: 1_400, unit: "per_week" }],
      },
    ]);

    expect(listing?.extras.map((extra) => extra.externalId)).toEqual(["1"]);
  });

  it("reads the first product when the payload flags none as default", () => {
    const listing = listingOf([
      { name: "Bareboat", extras: [{ id: 1, name: "Bedding", price: 40 }] },
      { name: "Crewed", extras: [{ id: 2, name: "Skipper", obligatory: true, price: 900 }] },
    ]);

    expect(listing?.extras.map((extra) => extra.externalId)).toEqual(["1"]);
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

  describe("the deposit waiver", () => {
    const waiverYacht = (fields: Record<string, JsonValue>, extra: Record<string, JsonValue>) =>
      projectBookingManagerCatalogue(
        new Map([
          [
            "yacht" as const,
            [
              {
                externalId: "5001",
                payload: {
                  ...yacht([
                    {
                      isDefaultProduct: true,
                      extras: [{ id: 11, name: "Damage waiver", price: 250, ...extra }],
                    },
                  ]),
                  deposit: 2_500,
                  ...fields,
                },
              },
            ],
          ],
        ]),
      ).listings[0];

    it("reads the flag under the key the vendor actually sends", () => {
      const listing = waiverYacht({}, { includesDepositWaiver: true });

      expect(listing?.extras[0]?.depositInsurance).toBe(true);
    });

    it("still reads the spec's spelling", () => {
      const listing = waiverYacht({}, { includedDepositWaiver: true });

      expect(listing?.extras[0]?.depositInsurance).toBe(true);
    });

    it("leaves an extra that waives nothing unflagged", () => {
      const listing = waiverYacht({}, { includesDepositWaiver: false });

      expect(listing?.extras[0]?.depositInsurance).toBeUndefined();
    });

    it("carries the reduced deposit a waiver buys", () => {
      const listing = waiverYacht({ depositWithWaiver: 500 }, { includesDepositWaiver: true });

      expect(listing?.securityDepositMinor).toBe(250_000);
      expect(listing?.securityDepositWhenInsuredMinor).toBe(50_000);
    });

    it("reads zero, and a figure that reduces nothing, as no waiver", () => {
      expect(waiverYacht({ depositWithWaiver: 0 }, {})?.securityDepositWhenInsuredMinor).toBe(
        undefined,
      );
      expect(
        waiverYacht({ depositWithWaiver: 2_500 }, {})?.securityDepositWhenInsuredMinor,
      ).toBeUndefined();
    });
  });

  describe("the vendor's own terms on an extra", () => {
    const extraOf = (fields: Record<string, JsonValue>) =>
      listingOf([
        { isDefaultProduct: true, extras: [{ id: 21, name: "SUP", price: 100, ...fields }] },
      ])?.extras[0];

    it("keeps the description as fine print, markup stripped", () => {
      expect(extraOf({ description: "<p>Applies only when skipper is chosen</p>" })?.note).toBe(
        "Applies only when skipper is chosen",
      );
      expect(extraOf({ description: "" })?.note).toBeUndefined();
    });

    it("reads -1 as no quantity cap, and keeps a real one", () => {
      expect(extraOf({ quantityLimit: -1, quantityIsSelectable: false })).toMatchObject({
        quantitySelectable: false,
      });
      expect(extraOf({ quantityLimit: -1 })?.quantityLimit).toBeUndefined();
      expect(extraOf({ quantityLimit: 4, quantityIsSelectable: true })).toMatchObject({
        quantityLimit: 4,
        quantitySelectable: true,
      });
    });
  });

  describe("sailing areas", () => {
    const withBase = (sailingAreas: JsonValue[] | undefined, validSailingAreas: JsonValue[]) =>
      projectBookingManagerCatalogue(
        new Map<ProviderResourceType, { externalId: string; payload: JsonValue }[]>([
          [
            "yacht",
            [
              {
                externalId: "5001",
                payload: yacht([
                  {
                    isDefaultProduct: true,
                    extras: [
                      {
                        id: 31,
                        name: "CharterPack Caribbean",
                        obligatory: true,
                        price: 750,
                        validSailingAreas,
                      },
                    ],
                  },
                ]),
              },
            ],
          ],
          [
            "base",
            sailingAreas === undefined
              ? []
              : [{ externalId: "7", payload: { id: 7, sailingAreas } }],
          ],
        ]),
      ).listings[0]?.extras;

    it("drops an extra sold only in sailing areas the home base is not in", () => {
      expect(withBase([9, 10], [28])).toEqual([]);
    });

    it("keeps one sold in an area the home base is in", () => {
      expect(withBase([9, 28], [28])).toHaveLength(1);
    });

    it("keeps one restricted to no area, or where the base's areas are unknown", () => {
      expect(withBase([9], [])).toHaveLength(1);
      expect(withBase(undefined, [28])).toHaveLength(1);
      expect(withBase([], [28])).toHaveLength(1);
    });
  });

  describe("routes and bases", () => {
    const extraOf = (fields: Record<string, JsonValue>) =>
      listingOf([
        {
          isDefaultProduct: true,
          extras: [
            { id: 9, name: "APA 25%", obligatory: true, price: 0, percentage: 25, ...fields },
          ],
        },
      ])?.extras[0];

    /* Company 225 sends no `validForBases` key at all and `availableInBase` -1 on every extra. */
    it("leaves a fee with no route or base condition unrestricted", () => {
      const extra = extraOf({ availableInBase: -1, validSailingAreas: [] });

      expect(extra?.oneWayOnly).toBeUndefined();
      expect(extra?.validRoutes).toBeUndefined();
      expect(extra?.validForBaseIds).toBeUndefined();
      expect(extra?.externalBaseId).toBe("7");
    });

    it("reads a pair that returns to the home base as a return fee, not a one-way one", () => {
      const extra = extraOf({ validForBases: [{ from: [7], to: [7] }] });

      expect(extra?.oneWayOnly).toBeUndefined();
      expect(extra?.validRoutes).toEqual([{ from: "7", to: "7" }]);
    });

    it("marks a fee one-way only when none of its routes returns", () => {
      const extra = extraOf({
        name: "One Way Fee",
        validForBases: [{ from: ["1179950470000100000"], to: ["1179952620000100000"] }],
      });

      expect(extra?.oneWayOnly).toBe(true);
      expect(extra?.validRoutes).toEqual([
        { from: "1179950470000100000", to: "1179952620000100000" },
      ]);
    });

    it("expands each entry to every from and to it names, once per pair", () => {
      const extra = extraOf({
        validForBases: [
          { from: [1, 194], to: [1, 194] },
          { from: [194], to: [194] },
        ],
      });

      expect(extra?.oneWayOnly).toBeUndefined();
      expect(extra?.validRoutes).toEqual([
        { from: "1", to: "1" },
        { from: "1", to: "194" },
        { from: "194", to: "1" },
        { from: "194", to: "194" },
      ]);
    });

    it("keeps a 19-digit base id to its exact digits", () => {
      const extra = extraOf({ validForBases: [{ from: ["6614004890000100225"], to: [7] }] });

      expect(extra?.validRoutes).toEqual([{ from: "6614004890000100225", to: "7" }]);
    });

    it("restricts a fee sold at one base to that base", () => {
      const extra = extraOf({ availableInBase: "5984471530000100225" });

      expect(extra?.validForBaseIds).toEqual(["5984471530000100225"]);
    });
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

  it("caps the stay at the maximum duration on every rule", () => {
    const rules = rulesOf({
      allCheckInDays: [7, 1],
      minimumCharterDuration: 7,
      maximumCharterDuration: 14,
    });

    expect(rules).toHaveLength(4);
    expect(rules?.every((rule) => rule.minNights === 7 && rule.maxNights === 14)).toBe(true);
  });

  it("keeps a maximum on a yacht that states no weekday and no minimum", () => {
    expect(rulesOf({ defaultCheckInDay: -1, maximumCharterDuration: 1 })).toEqual([
      { checkinWeekday: undefined, checkoutWeekday: undefined, minNights: undefined, maxNights: 1 },
    ]);
  });

  it("drops a maximum below the minimum rather than publish a rule nothing satisfies", () => {
    expect(
      rulesOf({ defaultCheckInDay: -1, minimumCharterDuration: 7, maximumCharterDuration: 2 }),
    ).toEqual([
      { checkinWeekday: undefined, checkoutWeekday: undefined, minNights: 7, maxNights: undefined },
    ]);
  });
});

describe("rig and engine", () => {
  const specOf = (over: Record<string, JsonValue>) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "yacht" as const,
          [{ externalId: "5001", payload: { id: 5001, companyId: 42, homeBaseId: 7, ...over } }],
        ],
      ]),
    ).listings[0]?.spec;

  it("files the mainsail under the words NauSYS uses, so one filter finds both", () => {
    expect(specOf({ mainsailType: "Full batten" })?.sailType).toBe("full batten");
    expect(specOf({ mainsailType: "Furling" })?.sailType).toBe("furling/roll");
    expect(specOf({ mainsailType: "Semi full batten" })?.sailType).toBe("half batten");
  });

  it("reads None, in either language, as no mainsail", () => {
    expect(specOf({ mainsailType: "None" })?.sailType).toBeUndefined();
    expect(specOf({ mainsailType: "Keine" })?.sailType).toBeUndefined();
    expect(specOf({})?.sailType).toBeUndefined();
  });

  it.each([
    ["2 x 38 HP", 2, "38 hp"],
    ["2x57 hp", 2, "57 hp"],
    ["2xYanmar 320 HP", 2, "320 hp"],
    ["Volvo 40 h.p.", undefined, "40 hp"],
    ["Volvo Saildrive 20 hp", undefined, "20 hp"],
    ["75 PS", undefined, "75 hp"],
    ["27,3 hp", undefined, "27.3 hp"],
    ["110 kW", undefined, "110 kW"],
  ])("reads %s", (engine, engines, enginePower) => {
    const spec = specOf({ engine });
    expect(spec?.engines).toBe(engines);
    expect(spec?.enginePower).toBe(enginePower);
  });

  it.each(["", "Yanmar Diesel", "78 ", "Volvo MD 2030 21/29 (kW/PS)"])(
    "leaves %j unread rather than guess its unit",
    (engine) => {
      expect(specOf({ engine })?.enginePower).toBeUndefined();
    },
  );
});

describe("amenity categories", () => {
  const equipmentRecords = parseExactJson(
    readFileSync(new URL("fixtures/equipment.json", import.meta.url), "utf8"),
  );
  const catalogueOf = (equipmentRaw: JsonValue[][]) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "equipment_category" as const,
          (Array.isArray(equipmentRecords) ? equipmentRecords : []).map((payload, index) => ({
            externalId: String(index),
            payload,
          })),
        ],
        [
          "yacht" as const,
          equipmentRaw.map((rows, index) => ({
            externalId: String(index),
            payload: { id: 5000 + index, companyId: 42, homeBaseId: 7, equipmentRaw: rows },
          })),
        ],
      ]),
    );
  const categoryOf = (catalogue: ReturnType<typeof catalogueOf>, name: string) => {
    const amenity = catalogue.amenities.find((item) => item.name === name);
    return catalogue.amenityCategories.find(
      (item) => item.externalId === amenity?.externalAmenityCategoryId,
    )?.name;
  };
  const row = (parentId: number, name: string, categoryName: string) => ({
    id: 900 + parentId,
    parentId,
    name,
    value: "",
    categoryName,
  });

  it("files an amenity through parentId, not the raw row's own id or its spelling", () => {
    const catalogue = catalogueOf([[row(5, "Chartplotter", "Instruments")]]);
    expect(categoryOf(catalogue, "Chart plotter")).toBe("Instruments");
  });

  it("prefers a specific category over an operator's catch-all, however many use it", () => {
    const catalogue = catalogueOf([
      [row(10, "Radar", "Equipment")],
      [row(10, "Radar", "Equipment")],
      [row(10, "Radar", "Instruments")],
    ]);
    expect(categoryOf(catalogue, "Radar")).toBe("Instruments");
  });

  it("settles a disagreement by count, then by name, the same way on every sync", () => {
    const twoToOne = catalogueOf([
      [row(4, "Dinghy", "Dinghy")],
      [row(4, "Dinghy", "Dinghy")],
      [row(4, "Dinghy", "On-Deck")],
    ]);
    const tied = catalogueOf([[row(4, "Dinghy", "On-Deck")], [row(4, "Dinghy", "Dinghy")]]);

    expect(categoryOf(twoToOne, "Dinghy")).toBe("Dinghy");
    expect(categoryOf(tied, "Dinghy")).toBe("Dinghy");
  });

  it("falls back to the name only where no row points at the amenity", () => {
    const catalogue = catalogueOf([[row(-1, "DVD player", "Entertainment")]]);
    expect(categoryOf(catalogue, "DVD player")).toBe("Entertainment");
  });

  it("files what nothing names under a category of its own, not the operators' Equipment", () => {
    const catalogue = catalogueOf([[row(10, "Radar", "Equipment")]]);

    expect(categoryOf(catalogue, "Radar")).toBe("Equipment");
    expect(categoryOf(catalogue, "Heating")).toBe("Uncategorised");
  });
});

describe("amenity names in other languages", () => {
  const amenitiesOf = (payload: JsonValue) =>
    projectBookingManagerCatalogue(
      new Map([["equipment_category" as const, [{ externalId: "4", payload }]]]),
    ).amenities;

  it("carries the vendor's translations, and not the ones that are only the English again", () => {
    const [dinghy] = amenitiesOf({
      id: 4,
      name: "Dinghy",
      translations: { de: "Beiboot", es: "Embarcación auxiliar", sv: "Dinghy", no: " " },
    });

    expect(dinghy?.translations).toEqual({ de: "Beiboot", es: "Embarcación auxiliar" });
  });

  it("leaves an amenity no language renamed without translations", () => {
    expect(
      amenitiesOf({ id: 1, name: "Autopilot", translations: { de: "Autopilot" } })[0],
    ).not.toHaveProperty("translations.de");
    expect(amenitiesOf({ id: 1, name: "Autopilot" })[0]?.translations).toBeUndefined();
  });
});

describe("pictures", () => {
  const mediaOf = (images: JsonValue[]) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "yacht" as const,
          [{ externalId: "5001", payload: { id: 5001, companyId: 42, homeBaseId: 7, images } }],
        ],
      ]),
    ).listings[0]?.media;
  const image = (name: string, description: string, sortOrder: number | null = 0) => ({
    url: `https://example.test/${name}.jpg`,
    description,
    ...(sortOrder === null ? null : { sortOrder }),
  });

  it("makes the picture the operator labelled Main image the cover, wherever it sits", () => {
    expect(
      mediaOf([image("plan", "Plan image"), image("deck", ""), image("hull", "Main image")]),
    ).toEqual([
      { externalUrl: "https://example.test/hull.jpg", role: "main", sortOrder: 0 },
      { externalUrl: "https://example.test/plan.jpg", role: "layout", sortOrder: 1 },
      { externalUrl: "https://example.test/deck.jpg", role: "gallery", sortOrder: 2 },
    ]);
  });

  it("falls back to the first picture that is not a plan", () => {
    const media = mediaOf([image("plan", "Plan image"), image("saloon", "Interior image")]);

    expect(media?.map((item) => [item.externalUrl, item.role])).toEqual([
      ["https://example.test/saloon.jpg", "main"],
      ["https://example.test/plan.jpg", "layout"],
    ]);
  });

  it("gives a yacht showing only its plans no cover rather than a drawing", () => {
    expect(mediaOf([image("plan", "Plan image")])?.map((item) => item.role)).toEqual(["layout"]);
  });

  it("orders by sortOrder where the vendor sets one, and by the array where it does not", () => {
    const media = mediaOf([image("c", "", 3), image("b", "", 2), image("a", "Main image", 5)]);

    expect(media?.map((item) => item.externalUrl)).toEqual([
      "https://example.test/a.jpg",
      "https://example.test/b.jpg",
      "https://example.test/c.jpg",
    ]);
  });

  it("puts pictures with no sortOrder after the ordered ones, in array order", () => {
    const media = mediaOf([
      image("x", "Main image", null),
      image("b", "", 2),
      image("y", "", null),
      image("a", "", 1),
    ]);

    expect(media?.map((item) => item.externalUrl)).toEqual([
      "https://example.test/x.jpg",
      "https://example.test/a.jpg",
      "https://example.test/b.jpg",
      "https://example.test/y.jpg",
    ]);
  });
});

describe("the skipper licence", () => {
  const licenceOf = (value: JsonValue | undefined) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "yacht" as const,
          [
            {
              externalId: "5001",
              payload: {
                id: 5001,
                companyId: 42,
                homeBaseId: 7,
                ...(value === undefined ? null : { requiredSkipperLicense: value }),
              },
            },
          ],
        ],
      ]),
    ).listings[0]?.skipperLicenceRequired;

  it("reads 1 and 0 as the vendor's yes and no, and anything else as no answer", () => {
    expect(licenceOf(1)).toBe(true);
    expect(licenceOf(0)).toBe(false);
    expect(licenceOf(2)).toBeUndefined();
    expect(licenceOf(undefined)).toBeUndefined();
  });
});

describe("the legal limit on board", () => {
  const specOf = (over: Record<string, JsonValue>) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "yacht" as const,
          [
            {
              externalId: "5001",
              payload: { id: 5001, companyId: 42, homeBaseId: 7, berths: 10, ...over },
            },
          ],
        ],
      ]),
    ).listings[0]?.spec;

  it("reads maxPeopleOnBoard as the most people the boat may carry", () => {
    expect(specOf({ maxPeopleOnBoard: 8 })).toMatchObject({ berths: 10, maxPersons: 8 });
  });

  it("leaves it unknown where the vendor sends nothing or zero", () => {
    expect(specOf({})?.maxPersons).toBeUndefined();
    expect(specOf({ maxPeopleOnBoard: 0 })?.maxPersons).toBeUndefined();
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
 * areas that are coarser than our regions. The base belongs in the region the other vendor's
 * boats around it already sail from, so both fleets answer one search filter.
 */
describe("geography", () => {
  const referenceRegions = [
    { countryCode: "HR", name: "Split region", points: [{ lat: 43.5089, lng: 16.4392 }] },
    { countryCode: "HR", name: "Zadar region", points: [{ lat: 44.1194, lng: 15.2314 }] },
    { countryCode: "HR", name: "Dubrovnik region", points: [{ lat: 42.6697, lng: 18.1246 }] },
    { countryCode: "ME", name: "Montenegro", points: [{ lat: 42.4347, lng: 18.6961 }] },
  ];

  const geographyOf = (bases: Payload[]) =>
    projectBookingManagerCatalogue(
      recordSet([
        [
          "country",
          [
            { id: 191, name: "Croatia", shortName: "HR", worldRegion: 39 },
            { id: 499, name: "Montenegro", shortName: "ME", worldRegion: 39 },
            { id: 470, name: "Malta", shortName: "MT", worldRegion: 39 },
          ],
        ],
        ["region", [{ id: 39, name: "Southern Europe" }]],
        [
          "location",
          [
            { id: 3, name: "Split" },
            { id: 9, name: "Dubrovnik / Montenegro" },
            { id: 44, name: "Malta" },
          ],
        ],
        ["base", bases],
      ]),
      { referenceRegions },
    );

  it("places a Split base in our Split region, with its town as the location", () => {
    const { regions, locations, bases } = geographyOf([
      {
        id: 1,
        name: "ACI Marina Split",
        city: "Split",
        countryId: 191,
        latitude: "43.5040",
        longitude: "16.4300",
        sailingAreas: [3],
      },
    ]);

    expect(regions).toEqual([
      { externalId: "region:191:Split region", externalCountryId: "191", name: "Split region" },
    ]);
    expect(locations).toEqual([
      {
        externalId: "location:191:Split region:Split",
        externalRegionId: "region:191:Split region",
        name: "Split",
        city: "Split",
      },
    ]);
    expect(bases[0]?.externalLocationId).toBe("location:191:Split region:Split");
  });

  it("places a base with no sailing area in the nearest region by coordinates", () => {
    const { regions } = geographyOf([
      {
        id: 1,
        name: "Marina Borik",
        city: "Zadar",
        countryId: 191,
        latitude: "44.1330",
        longitude: "15.2140",
        sailingAreas: [],
      },
    ]);

    expect(regions.map((item) => item.name)).toEqual(["Zadar region"]);
  });

  it("splits a sailing area that crosses a border by country", () => {
    const { regions } = geographyOf([
      { id: 1, name: "Port Gruž", countryId: 191, sailingAreas: [9] },
      { id: 2, name: "Porto Montenegro", countryId: 499, sailingAreas: [9] },
    ]);

    expect(regions.map((item) => [item.externalCountryId, item.name])).toEqual([
      ["191", "Dubrovnik region"],
      ["499", "Montenegro"],
    ]);
  });

  it("falls back to the sailing area, then the country, where no region of ours fits", () => {
    const { regions } = geographyOf([
      { id: 1, name: "Grand Harbour Marina", countryId: 470, sailingAreas: [44] },
      { id: 2, name: "Somewhere", countryId: 470, sailingAreas: [] },
    ]);

    expect(regions.map((item) => item.name)).toEqual(["Malta"]);
  });

  it("never names a region after the world region", () => {
    const { regions } = geographyOf([
      { id: 1, name: "ACI Marina Split", countryId: 191, sailingAreas: [3] },
      { id: 2, name: "Marina Punat", countryId: 191, sailingAreas: [] },
      { id: 3, name: "Grand Harbour Marina", countryId: 470, sailingAreas: [44] },
    ]);

    expect(regions.map((item) => item.name)).not.toContain("Southern Europe");
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

/*
 * Company 225 files boats at bases whose ids are 0, 25, 127 and 194 beside the usual 19 digits.
 * Rumba sails from Marina Cienfuegos, base 0: read as "no base", the yacht would lose its home
 * and the listing would be skipped at the writer.
 */
describe("short base ids", () => {
  const cienfuegos = {
    id: 0,
    name: "Marina Cienfuegos",
    city: "Cienfuegos",
    country: "Cuba",
    address: "",
    latitude: "22.126437",
    longitude: "-80.451321",
    countryId: 192,
    sailingAreas: [28],
  };
  const bodrum = {
    id: 25,
    name: "Bodrum Marina",
    city: "Bodrum",
    country: "Turkey",
    address: "",
    latitude: "37.034471",
    longitude: "27.424879",
    countryId: 792,
    sailingAreas: [25],
  };

  const catalogue = projectBookingManagerCatalogue(
    recordSet([
      [
        "country",
        [
          { id: 192, name: "Cuba", shortName: "CU", worldRegion: 3 },
          { id: 792, name: "Turkey", shortName: "TR", worldRegion: 39 },
        ],
      ],
      ["base", [cienfuegos, bodrum]],
      [
        "yacht",
        [
          { id: 1, name: "Rumba", companyId: 225, homeBaseId: 0, homeBase: "Marina Cienfuegos" },
          { id: 2, name: "Iraz", companyId: 225, homeBaseId: 25, homeBase: "Bodrum Marina" },
        ],
      ],
    ]),
  );

  it("keeps base 0 and base 25 as bases", () => {
    expect(catalogue.bases.map((base) => [base.externalId, base.name])).toEqual([
      ["0", "Marina Cienfuegos"],
      ["25", "Bodrum Marina"],
    ]);
  });

  it("files a yacht at base 0 rather than at no base", () => {
    expect(catalogue.listings.map((listing) => [listing.name, listing.externalBaseId])).toEqual([
      ["Rumba", "0"],
      ["Iraz", "25"],
    ]);
  });
});

/* West Wind as company 225 sent it on 2026-09-21: a Cabin product first, the default Bareboat after. */
describe("a live company 225 yacht", () => {
  const payload = parseExactJson(
    readFileSync(new URL("fixtures/yacht-225-west-wind.json", import.meta.url), "utf8"),
  );
  const listing = projectBookingManagerCatalogue(
    new Map([["yacht" as const, [{ externalId: "978989630000100225", payload }]]]),
  ).listings[0];

  it("prices its extras from the default product and files them at its home base", () => {
    expect(listing?.extras).toHaveLength(11);
    expect(new Set(listing?.extras.map((extra) => extra.externalBaseId))).toEqual(new Set(["194"]));
  });

  it("restricts none of them, since the fleet sends no route and no base", () => {
    for (const extra of listing?.extras ?? []) {
      expect(extra.oneWayOnly).toBeUndefined();
      expect(extra.validRoutes).toBeUndefined();
      expect(extra.validForBaseIds).toBeUndefined();
    }
  });

  it("carries the extras the Charter Pack bundles, the obligatory Cleaning among them", () => {
    const pack = listing?.extras.find((extra) => extra.name === "Charter Pack");
    const cleaning = listing?.extras.find((extra) => extra.name === "Cleaning");

    expect(pack?.includedExternalIds).toEqual(["1488975580000100225", "26877460000100225"]);
    expect(cleaning).toMatchObject({ externalId: "26877460000100225", obligatory: true });
    expect(cleaning?.includedExternalIds).toBeUndefined();
  });

  it("reads no waiver where the fleet configures none", () => {
    expect(listing?.securityDepositMinor).toBe(200_000);
    expect(listing?.securityDepositWhenInsuredMinor).toBeUndefined();
    expect(listing?.extras.some((extra) => extra.depositInsurance)).toBe(false);
  });
});

describe("handover times", () => {
  it("keeps each boat's own, which the vendor states on the boat", () => {
    const records: ProviderRecordSet = new Map([
      [
        "yacht" as const,
        [
          {
            externalId: "5001",
            payload: {
              id: 5001,
              companyId: 42,
              homeBaseId: 7,
              name: "Aurora",
              currency: "EUR",
              defaultCheckInTime: "17:00:00",
              defaultCheckOutTime: "08:30:00",
            },
          },
        ],
      ],
    ]);

    expect(projectBookingManagerCatalogue(records).listings[0]).toMatchObject({
      checkInTime: "17:00",
      checkOutTime: "08:30",
    });
  });
});

/*
 * Five company 225 yachts as the vendor sent them on 2026-09-21: Virgin Mary and Artic fun sold
 * Crewed by default, Giulia Bareboat by default beside a Crewed product, Queen II and Whisper
 * bareboat with their rigs and engines stated.
 */
describe("live company 225 yachts: crew, rig and pictures", () => {
  const payloads = parseExactJson(
    readFileSync(new URL("fixtures/yachts-225-crew-and-rig.json", import.meta.url), "utf8"),
  );
  const yachtPayloads = Array.isArray(payloads) ? payloads : [];
  const { listings } = projectBookingManagerCatalogue(
    new Map([
      [
        "yacht" as const,
        yachtPayloads.map((payload, index) => ({ externalId: String(index), payload })),
      ],
    ]),
  );
  const listingNamed = (name: string) => listings.find((listing) => listing.name === name);

  it("sells a yacht whose default product is Crewed as full crew", () => {
    expect(listingNamed("Virgin Mary - Crewed")?.crewType).toBe("full-crew");
    expect(listingNamed("Artic fun")?.crewType).toBe("full-crew");
  });

  it("caps the stay at the 90 nights every yacht of the fleet states", () => {
    for (const listing of listings) {
      expect(listing.checkinRules.every((rule) => rule.maxNights === 90)).toBe(true);
    }
  });

  it("covers Artic fun and Virgin Mary with the picture labelled Main image, not a plan", () => {
    expect(listingNamed("Artic fun")?.media.map((item) => item.role)).toEqual([
      "main",
      "layout",
      "gallery",
    ]);
    expect(listingNamed("Artic fun")?.media[0]?.externalUrl).toMatch(/Oceanis46\.1_main\.jpg$/);
    expect(listingNamed("Virgin Mary - Crewed")?.media[0]?.externalUrl).toMatch(
      /BavariaC38_main\.jpg$/,
    );
  });

  it("carries the rig and engine the fleet states", () => {
    expect(listingNamed("Queen II")?.spec).toMatchObject({ sailType: "full batten" });
    expect(listingNamed("Whisper")?.spec).toMatchObject({ engines: 2, enginePower: "38 hp" });
    expect(listingNamed("Whisper")?.spec.sailType).toBeUndefined();
  });

  it("carries the licence requirement the vendor states per hull, Giulia's waived", () => {
    expect(listingNamed("Giulia")?.skipperLicenceRequired).toBe(false);
    expect(listingNamed("Queen II")?.skipperLicenceRequired).toBe(true);
  });

  it("reads the default product, not a Crewed one the yacht also sells", () => {
    expect(listingNamed("Giulia")?.crewType).toBe("bareboat");
  });

  it("names the skipper Queen II bills on every charter, and no optional one", () => {
    const skippers = listings
      .flatMap((listing) => listing.extras)
      .filter((extra) => extra.name === "Skipper");

    expect(skippers.filter((extra) => !extra.obligatory).length).toBeGreaterThan(0);
    for (const extra of skippers) {
      expect(extra.crewRole).toBe(extra.obligatory ? "skipper" : undefined);
    }
    expect(listingNamed("Queen II")?.extras).toContainEqual(
      expect.objectContaining({ name: "Skipper", obligatory: true, crewRole: "skipper" }),
    );
  });
});

describe("crew type from the product the listing sells", () => {
  const crewTypeOf = (product: JsonValue) =>
    projectBookingManagerCatalogue(
      new Map([
        [
          "yacht" as const,
          [
            {
              externalId: "5001",
              payload: {
                id: 5001,
                companyId: 42,
                homeBaseId: 7,
                currency: "EUR",
                products: [product],
              },
            },
          ],
        ],
      ]),
    ).listings[0]?.crewType;

  it("reads Skippered as a skipper aboard rather than a full crew", () => {
    expect(crewTypeOf({ name: "Skippered", crewedByDefault: true, isDefaultProduct: true })).toBe(
      "skipper",
    );
  });

  it("reads every crewed product the vendor flags as full crew", () => {
    for (const name of ["Crewed", "Powered", "AllInclusive", "DailyCharter"]) {
      expect(crewTypeOf({ name, crewedByDefault: true, isDefaultProduct: true })).toBe("full-crew");
    }
  });

  it("reads Bareboat and every Flotilla variant as bareboat", () => {
    for (const name of ["Bareboat", "Flotilla", "Flotilla Lefkas"]) {
      expect(crewTypeOf({ name, crewedByDefault: false, isDefaultProduct: true })).toBe("bareboat");
    }
  });

  it("leaves a Cabin or Berth product unset rather than guessing its crew", () => {
    expect(
      crewTypeOf({ name: "Cabin", crewedByDefault: false, isDefaultProduct: true }),
    ).toBeUndefined();
    expect(
      crewTypeOf({ name: "Berth", crewedByDefault: false, isDefaultProduct: true }),
    ).toBeUndefined();
  });

  it("falls back to the name only where the vendor leaves the flag out", () => {
    expect(crewTypeOf({ name: "Crewed", isDefaultProduct: true })).toBe("full-crew");
    expect(crewTypeOf({ name: "Bareboat", isDefaultProduct: true })).toBe("bareboat");
  });

  it("names the role of a crew member the operator bills on every charter", () => {
    const extras = (items: JsonValue[]) =>
      projectBookingManagerCatalogue(
        new Map([
          [
            "yacht" as const,
            [
              {
                externalId: "5001",
                payload: {
                  id: 5001,
                  companyId: 42,
                  homeBaseId: 7,
                  currency: "EUR",
                  products: [{ name: "Bareboat", isDefaultProduct: true, extras: items }],
                },
              },
            ],
          ],
        ]),
      ).listings[0]?.extras ?? [];

    const [obligatory, zero, statement, optional] = extras([
      {
        id: 1,
        name: "Skipper fees (plus his/her food) - obligatory",
        obligatory: true,
        price: 210,
      },
      { id: 2, name: "Skipper - included", obligatory: true, price: 0 },
      {
        id: 3,
        name: "REQUIRED LICENCE + 1 crew member with valid licence",
        obligatory: true,
        price: 10,
      },
      { id: 4, name: "Skipper", obligatory: false, price: 200 },
    ]);

    expect(obligatory?.crewRole).toBe("skipper");
    expect(zero?.crewRole).toBeUndefined();
    expect(statement?.crewRole).toBeUndefined();
    expect(optional?.crewRole).toBeUndefined();
  });
});
