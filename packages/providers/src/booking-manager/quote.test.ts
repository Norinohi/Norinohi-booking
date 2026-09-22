import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { unscopedCompanies } from "../shared/company-scope";
import { parseExactJson } from "../shared/exact-json";
import { refusesOnlyTheRoute, SlotUnavailableError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { providerRejection } from "../testing/contracts";
import { bookingDraftSchema } from "../types";
import { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { restExtrasSchema, restOfferListSchema, restOfferSchema } from "./endpoints";
import {
  createBookingManagerQuoteService,
  charterPriceOf,
  mapOfferToProviderQuote,
  type OfferMapping,
  repriceRequestFor,
  routeOptionsFor,
  selectOffer,
} from "./quote";

type ExtraInput = z.input<typeof restExtrasSchema>;

function offerWith(extra: ExtraInput) {
  return restOfferSchema.parse({
    yachtId: "9001",
    dateFrom: "01.06.2026 17:00",
    dateTo: "08.06.2026 09:00",
    price: 1000,
    currency: "EUR",
    obligatoryExtras: [extra],
  });
}

function mappingFor(
  extra: ExtraInput,
  labelFor?: OfferMapping["labelFor"],
  guests = 4,
): OfferMapping {
  return {
    offer: offerWith(extra),
    listingId: "lst_1",
    checkIn: "2026-06-01",
    checkOut: "2026-06-08",
    guests,
    requestedCurrency: "EUR",
    expiresAt: "2026-05-01T00:00:00.000Z",
    labelFor,
  };
}

describe("mapOfferToProviderQuote handover times", () => {
  it("reads the operator's check-in and check-out off the offer", () => {
    const mapping = mappingFor({ id: "77", price: 150, obligatory: true });
    const quote = mapOfferToProviderQuote({
      ...mapping,
      offer: { ...mapping.offer, dateFrom: "2026-06-01 17:00:00", dateTo: "2026-06-08 09:00:00" },
    });

    expect(quote).toMatchObject({
      checkIn: "2026-06-01",
      checkOut: "2026-06-08",
      checkInTime: "17:00",
      checkOutTime: "09:00",
    });
  });

  it("leaves them unset where the offer carries only dates", () => {
    const mapping = mappingFor({ id: "77", price: 150, obligatory: true });
    const quote = mapOfferToProviderQuote({
      ...mapping,
      offer: { ...mapping.offer, dateFrom: "2026-06-01", dateTo: "2026-06-08" },
    });

    expect(quote.checkInTime).toBeUndefined();
    expect(quote.checkOutTime).toBeUndefined();
  });
});

describe("mapOfferToProviderQuote extras", () => {
  const cleaning = { id: "77", price: 150, obligatory: true };

  it("prices a percentage extra off the charter price, not its zero price field", () => {
    const mapping = mappingFor({ id: "77", kind: 0, percentage: 5, price: 0 });
    // 5% of the 1000.00 charter. Declared by the vendor too, so the subtotal
    // assertion in mapOfferToProviderQuote has to agree with what we computed.
    const quote = mapOfferToProviderQuote({
      ...mapping,
      offer: { ...mapping.offer, obligatoryExtrasPrice: 50 },
    });

    expect(quote.lines.find((line) => line.kind === "extra")?.amount.amountMinor).toBe(5000);
  });

  it("fails the quote when a percentage extra disagrees with the vendor subtotal", () => {
    const mapping = mappingFor({ id: "77", kind: 0, percentage: 5, price: 0 });

    expect(() =>
      mapOfferToProviderQuote({
        ...mapping,
        offer: { ...mapping.offer, obligatoryExtrasPrice: 60 },
      }),
    ).toThrow(/sum to 5000, declared 6000/);
  });

  /*
   * Each line is rounded on its own, so a subtotal built from several can sit a cent or two
   * from the one the vendor rounded once. Refusing over that made yacht 5823396120000107041
   * unquotable on every date for a single cent: 38451 against a declared 38452.
   */
  it("absorbs a cent of rounding into the largest line rather than refusing the charter", () => {
    const mapping = mappingFor({ id: "77", kind: 0, percentage: 5, price: 0 });

    const quote = mapOfferToProviderQuote({
      ...mapping,
      offer: { ...mapping.offer, obligatoryExtrasPrice: 50.01 },
    });

    expect(quote.lines.find((line) => line.kind === "extra")?.amount.amountMinor).toBe(5001);
    /* And the total still adds up to the lines the customer is shown. */
    expect(quote.total.amountMinor).toBe(
      quote.lines.reduce((sum, line) => sum + line.amount.amountMinor, 0),
    );
  });

  it("still refuses a subtotal that rounding cannot explain", () => {
    const mapping = mappingFor({ id: "77", kind: 0, percentage: 5, price: 0 });

    expect(() =>
      mapOfferToProviderQuote({
        ...mapping,
        offer: { ...mapping.offer, obligatoryExtrasPrice: 60 },
      }),
    ).toThrow(/sum to 5000, declared 6000/);
  });

  it("refuses a percentage extra that carries no percentage", () => {
    expect(() => mapOfferToProviderQuote(mappingFor({ id: "77", kind: 0, price: 0 }))).toThrow(
      /carries none/,
    );
  });

  it("bills a currency-priced extra as the amount it states", () => {
    const quote = mapOfferToProviderQuote(mappingFor({ ...cleaning, kind: 1 }));

    expect(quote.lines.find((line) => line.kind === "extra")?.amount.amountMinor).toBe(15000);
  });

  it("codes an extra in the canonical space the listing page uses", () => {
    const quote = mapOfferToProviderQuote(mappingFor({ ...cleaning, name: "Final cleaning" }));

    expect(quote.lines.find((line) => line.kind === "extra")?.code).toBe("service:77");
  });

  it("names an unnamed extra from the catalogue rather than a generic fallback", () => {
    const quote = mapOfferToProviderQuote(
      mappingFor(cleaning, (externalId) => (externalId === "77" ? "Final cleaning" : undefined)),
    );

    expect(quote.lines.find((line) => line.kind === "extra")?.label).toBe("Final cleaning");
  });

  it("prefers the catalogue name over the one the offer carries", () => {
    const quote = mapOfferToProviderQuote(
      mappingFor({ ...cleaning, name: "CLEANING FEE" }, () => "Final cleaning"),
    );

    expect(quote.lines.find((line) => line.kind === "extra")?.label).toBe("Final cleaning");
  });

  it("carries the operator's terms for an extra as the line's note, as plain text", () => {
    const quote = mapOfferToProviderQuote(
      mappingFor({ ...cleaning, description: "<p>Includes <b>final</b> cleaning &amp; gas</p>" }),
    );

    expect(quote.lines.find((line) => line.kind === "extra")?.note).toBe(
      "Includes final cleaning & gas",
    );
  });

  it("writes no note where the operator left the description empty", () => {
    const quote = mapOfferToProviderQuote(mappingFor({ ...cleaning, description: "" }));

    expect(quote.lines.find((line) => line.kind === "extra")).not.toHaveProperty("note");
  });

  it("falls back to the offer's own name when the catalogue does not know the extra", () => {
    const quote = mapOfferToProviderQuote(
      mappingFor({ ...cleaning, name: "Final cleaning" }, () => undefined),
    );

    expect(quote.lines.find((line) => line.kind === "extra")?.label).toBe("Final cleaning");
  });
});

/**
 * The vendor prices per-person extras against the `passengersOnBoard` on the
 * `/offers` query and returns the product, so the mapper must copy the figure
 * across untouched. These two payloads are what the live API answered for one
 * yacht at two headcounts: a per-person extra at 70 EUR each, the base price
 * unmoved.
 */
describe("mapOfferToProviderQuote per-person extras", () => {
  const towels = { id: "696570151400225", name: "Towels", obligatory: true };

  function extraMinorFor(guests: number, price: number) {
    const quote = mapOfferToProviderQuote(mappingFor({ ...towels, price }, undefined, guests));
    return quote.lines.find((line) => line.kind === "extra")?.amount.amountMinor;
  }

  it("bills the headcount the vendor already priced in, not a unit price times guests", () => {
    expect(extraMinorFor(2, 140)).toBe(14_000);
    expect(extraMinorFor(5, 350)).toBe(35_000);
  });

  it("leaves the base line alone when only the headcount differs", () => {
    const baseOf = (guests: number, price: number) =>
      mapOfferToProviderQuote(mappingFor({ ...towels, price }, undefined, guests)).lines.find(
        (line) => line.kind === "base",
      )?.amount.amountMinor;

    expect(baseOf(2, 140)).toBe(baseOf(5, 350));
  });
});

/*
 * The vendor answers a one-way fleet with one offer per sellable base pair, ordered by product
 * rather than by route, so the first is whichever pair it happened to list. Taking it charged a
 * one-way nobody asked for: on the week of 26 September 2026 this hull's first candidate ran
 * Portumna to Carrick with a 155 EUR one-way fee, and the same-base return sat behind it.
 */
describe("selectOffer", () => {
  const pair = (startBaseId: string, endBaseId: string, obligatoryExtrasPrice: number) =>
    restOfferSchema.parse({
      yachtId: "9001",
      dateFrom: "2026-09-26 15:00:00",
      dateTo: "2026-10-03 09:00:00",
      price: 809,
      currency: "EUR",
      product: "Bareboat",
      startBaseId,
      endBaseId,
      obligatoryExtrasPrice,
    });

  const oneWay = pair("100", "200", 305);
  const sameBase = pair("100", "100", 150);

  it("prefers a charter that returns to its own base over the vendor's first answer", () => {
    const chosen = selectOffer([oneWay, sameBase], "9001", "2026-09-26", "2026-10-03", undefined);

    expect(chosen?.endBaseId).toBe("100");
    expect(chosen?.obligatoryExtrasPrice).toBe(150);
  });

  it("takes the cheapest all-in where both charters return to base", () => {
    const dearer = pair("200", "200", 400);
    const chosen = selectOffer([dearer, sameBase], "9001", "2026-09-26", "2026-10-03", undefined);

    expect(chosen?.obligatoryExtrasPrice).toBe(150);
  });

  it("still answers when only a one-way is on offer", () => {
    expect(selectOffer([oneWay], "9001", "2026-09-26", "2026-10-03", undefined)).toBe(oneWay);
  });

  it("keeps product ahead of route, because a product is a different charter", () => {
    const crewed = restOfferSchema.parse({
      ...JSON.parse(JSON.stringify(oneWay)),
      product: "Crewed",
    });
    const chosen = selectOffer([sameBase, crewed], "9001", "2026-09-26", "2026-10-03", "Crewed");

    expect(chosen?.product).toBe("Crewed");
  });

  it("never prices another product in place of the one asked for", () => {
    const crewed = restOfferSchema.parse({
      ...JSON.parse(JSON.stringify(sameBase)),
      product: "Crewed",
    });

    expect(selectOffer([crewed], "9001", "2026-09-26", "2026-10-03", "Bareboat")).toBeUndefined();
  });

  /*
   * The Shannon week of 26 September 2026 sells both ends from both bases: Carrick (100) and
   * Portumna (200). Each pair asked for is the pair priced, and a drop-off asked for with its
   * start never comes back as the round trip from the other base, which ranks first.
   */
  describe("on a week sold from two bases", () => {
    const pairs = [
      pair("100", "100", 150),
      pair("100", "200", 305),
      pair("200", "200", 120),
      pair("200", "100", 305),
    ];
    const pick = (route: { startBaseId?: string; endBaseId?: string }) => {
      const chosen = selectOffer(pairs, "9001", "2026-09-26", "2026-10-03", undefined, route);
      return chosen && `${chosen.startBaseId}>${chosen.endBaseId}`;
    };

    it.each([
      ["100", "100"],
      ["100", "200"],
      ["200", "200"],
      ["200", "100"],
    ])("prices %s to %s when that pair is asked for", (startBaseId, endBaseId) => {
      expect(pick({ startBaseId, endBaseId })).toBe(`${startBaseId}>${endBaseId}`);
    });

    it("keeps a one-way from the quoted start rather than the other base's round trip", () => {
      expect(pick({ startBaseId: "100", endBaseId: "200" })).toBe("100>200");
      // What the drop-off alone used to answer: the cheaper round trip from the other base.
      expect(pick({ endBaseId: "200" })).toBe("200>200");
    });

    it("returns to the pinned start when no drop-off is asked for", () => {
      expect(pick({ startBaseId: "100" })).toBe("100>100");
      expect(pick({ startBaseId: "200" })).toBe("200>200");
    });

    it("answers nothing for a pair the week does not sell", () => {
      expect(pick({ startBaseId: "100", endBaseId: "300" })).toBeUndefined();
    });
  });

  it("never ranks an offer at no price ahead of a priced one", () => {
    const unpriced = restOfferSchema.parse({ ...JSON.parse(JSON.stringify(sameBase)), price: 0 });
    const dearer = pair("200", "200", 400);

    expect(selectOffer([unpriced, dearer], "9001", "2026-09-26", "2026-10-03", undefined)).toBe(
      dearer,
    );
    expect(selectOffer([unpriced], "9001", "2026-09-26", "2026-10-03", undefined)).toBeUndefined();
  });

  it("offers no route at no price", () => {
    const unpriced = restOfferSchema.parse({ ...JSON.parse(JSON.stringify(oneWay)), price: 0 });

    expect(
      routeOptionsFor([sameBase, unpriced], "9001", "2026-09-26", "2026-10-03", undefined, "EUR"),
    ).toEqual([expect.objectContaining({ startBaseId: "100", endBaseId: "100" })]);
  });

  it("ignores offers the vendor echoed for other dates", () => {
    const otherWeek = restOfferSchema.parse({
      ...JSON.parse(JSON.stringify(sameBase)),
      dateFrom: "2026-10-03 15:00:00",
      dateTo: "2026-10-10 09:00:00",
    });

    expect(selectOffer([otherWeek], "9001", "2026-09-26", "2026-10-03", undefined)).toBeUndefined();
  });
});

/*
 * Rumba on company 225, week of 5 June 2027, exactly as `/offers` answered it. Its base is
 * Marina Cienfuegos, whose id is 0, beside neighbours with ids like 25 and 127 and the usual
 * 19 digits: nothing may read the 0 as "no base" or assume an id's length.
 */
describe("an offer on the vendor's short base ids", () => {
  const [rumba] = restOfferListSchema.parse(
    parseExactJson(
      '[{"yachtId":123325530000100225,"yacht":"Rumba","startBaseId":0,"endBaseId":0,' +
        '"startBase":"Cienfuegos / Marina Cienfuegos","endBase":"Cienfuegos / Marina Cienfuegos",' +
        '"dateFrom":"2027-06-05 17:00:00","dateTo":"2027-06-12 09:00:00","status":0,' +
        '"product":"Bareboat","price":4600.0,"currency":"EUR","startPrice":5000.0,' +
        '"obligatoryExtrasPrice":0.0,"obligatoryExtras":[],"paymentPlan":[' +
        '{"date":"2026-09-29 00:18:12","amount":2300.0},{"date":"2027-05-08 00:00:00","amount":2300.0}],' +
        '"discounts":[{"id":8294180160000100225,"name":"Early booking 2027","percentage":8.0,' +
        '"price":400.0,"currency":"EUR"}],"securityDeposit":2500.0,"commissionPercentage":15.0,' +
        '"commissionValue":690.0,"discountPercentage":8.0}]',
    ),
  );
  if (rumba === undefined) throw new Error("fixture did not parse");
  const yachtId = "123325530000100225";

  it("keeps base 0 as a base", () => {
    expect(rumba).toMatchObject({ yachtId, startBaseId: "0", endBaseId: "0" });
  });

  it("finds the offer when the drop-off asked for is base 0", () => {
    expect(
      selectOffer([rumba], yachtId, "2027-06-05", "2027-06-12", undefined, { endBaseId: "0" }),
    ).toBe(rumba);
  });

  it("names the discount the way the operator does", () => {
    const quote = mapOfferToProviderQuote({
      offer: rumba,
      listingId: "lst_rumba",
      checkIn: "2027-06-05",
      checkOut: "2027-06-12",
      guests: 4,
      requestedCurrency: "EUR",
      expiresAt: "2027-05-01T00:00:00.000Z",
    });

    expect(quote.lines).toEqual([
      expect.objectContaining({
        code: "base-charter",
        amount: { amountMinor: 500_000, currency: "EUR" },
      }),
      expect.objectContaining({
        code: "bm-discount-8294180160000100225",
        label: "Early booking 2027",
        kind: "discount",
        amount: { amountMinor: -40_000, currency: "EUR" },
      }),
    ]);
    expect(quote.total.amountMinor).toBe(460_000);
  });

  it("names the discount off its percentage where the steps do not add up", () => {
    const quote = mapOfferToProviderQuote({
      offer: { ...rumba, discounts: [{ id: "1", name: "Early booking 2027", price: 350 }] },
      listingId: "lst_rumba",
      checkIn: "2027-06-05",
      checkOut: "2027-06-12",
      guests: 4,
      requestedCurrency: "EUR",
      expiresAt: "2027-05-01T00:00:00.000Z",
    });

    expect(quote.lines.filter((line) => line.kind === "discount")).toEqual([
      expect.objectContaining({ code: "bm-discount", label: "Charter discount" }),
    ]);
  });

  it("names base 0 on the quote's route", () => {
    const quote = mapOfferToProviderQuote({
      offer: rumba,
      listingId: "lst_rumba",
      checkIn: "2027-06-05",
      checkOut: "2027-06-12",
      guests: 4,
      requestedCurrency: "EUR",
      expiresAt: "2027-05-01T00:00:00.000Z",
    });

    expect(quote.route).toEqual({ startBaseId: "0", endBaseId: "0" });
  });

  /* The spec spells ProductEnum lowercase; the vendor answers "Bareboat" and accepts both. */
  it.each(["bareboat", "BAREBOAT", " Bareboat "])(
    "matches the product whatever case it is spelled in (%o)",
    (productName) => {
      const crewed = restOfferSchema.parse({
        ...JSON.parse(JSON.stringify(rumba)),
        product: "Crewed",
      });

      expect(
        selectOffer([crewed, rumba], yachtId, "2027-06-05", "2027-06-12", productName)?.product,
      ).toBe("Bareboat");
    },
  );
});

/*
 * Company 225 states maxDiscountFromCommissionPercentage 10 on itself and on all 29 yachts, beside
 * a commission of 15 percent: Rumba's 690.00 commission leaves 69.00 we may give away.
 */
describe("the operator's bound on our client discount", () => {
  const rumba = restOfferSchema.parse({
    yachtId: "123325530000100225",
    dateFrom: "2027-06-05 17:00:00",
    dateTo: "2027-06-12 09:00:00",
    price: 4600,
    currency: "EUR",
    commissionPercentage: 15,
    commissionValue: 690,
  });
  const capOf = (
    offer: z.infer<typeof restOfferSchema>,
    maxDiscountFromCommissionPercentage: number | undefined,
  ) =>
    mapOfferToProviderQuote({
      offer,
      listingId: "lst_rumba",
      checkIn: "2027-06-05",
      checkOut: "2027-06-12",
      guests: 4,
      requestedCurrency: "EUR",
      maxDiscountFromCommissionPercentage,
      expiresAt: "2027-05-01T00:00:00.000Z",
    }).maxClientDiscount;

  it("allows the stated share of the commission", () => {
    expect(capOf(rumba, 10)).toEqual({ amountMinor: 6_900, currency: "EUR" });
  });

  it("allows nothing where the operator allows nothing", () => {
    expect(capOf(rumba, 0)?.amountMinor).toBe(0);
  });

  it("never allows more than the commission", () => {
    expect(capOf(rumba, 250)?.amountMinor).toBe(69_000);
    expect(capOf(rumba, undefined)?.amountMinor).toBe(69_000);
  });

  it("allows nothing against a commission the offer does not report", () => {
    const silent = restOfferSchema.parse({ ...rumba, commissionValue: null });
    expect(capOf(silent, 10)?.amountMinor).toBe(0);
    expect(capOf(silent, undefined)).toBeUndefined();
  });
});

describe("repriceRequestFor", () => {
  const draft = (route: { startBaseId?: string; endBaseId?: string } | null) =>
    bookingDraftSchema.parse({
      listingId: "lst_1",
      quoteId: "qt_1",
      checkIn: "2026-09-26",
      checkOut: "2026-10-03",
      guests: 4,
      extras: ["service:77"],
      crewType: "bareboat",
      priceSourceHash: "hash",
      route,
      customer: { name: "Ada", email: "ada@example.com" },
    });

  it("asks for the drop-off the quote was priced on", () => {
    expect(repriceRequestFor(draft({ startBaseId: "100", endBaseId: "200" }), "EUR")).toMatchObject(
      {
        listingId: "lst_1",
        checkIn: "2026-09-26",
        checkOut: "2026-10-03",
        guests: 4,
        extras: ["service:77"],
        crewType: "bareboat",
        currency: "EUR",
        startBaseId: "100",
        endBaseId: "200",
      },
    );
  });

  it("states the base pair even where the charter returns to its own base", () => {
    // `route` is the pair the chosen offer named, not a request the customer made, so stating
    // it re-prices that same offer rather than re-running the ranking and trusting it to land
    // the same way twice.
    expect(repriceRequestFor(draft({ startBaseId: "100", endBaseId: "100" }), "EUR")).toMatchObject(
      {
        startBaseId: "100",
        endBaseId: "100",
      },
    );
  });

  it("re-prices in the currency the quote was read in", () => {
    expect(repriceRequestFor({ ...draft(null), currency: "GBP" }, "EUR").currency).toBe("GBP");
    expect(repriceRequestFor(draft(null), "EUR").currency).toBe("EUR");
  });

  it("asks unfiltered where the provider named no bases", () => {
    const request = repriceRequestFor(draft(null), "EUR");
    expect(request).not.toHaveProperty("startBaseId");
    expect(request).not.toHaveProperty("endBaseId");
  });
});

describe("priceSourceHash and the payment plan", () => {
  const offerPaying = (plan: { date: string; amount: number }[]) =>
    restOfferSchema.parse({
      yachtId: "9001",
      dateFrom: "29.08.2026 17:00",
      dateTo: "05.09.2026 09:00",
      price: 5400,
      currency: "EUR",
      paymentPlan: plan,
    });

  const hashOf = (plan: { date: string; amount: number }[]) =>
    mapOfferToProviderQuote({
      offer: offerPaying(plan),
      listingId: "lst_1",
      checkIn: "2026-08-29",
      checkOut: "2026-09-05",
      guests: 2,
      requestedCurrency: "EUR",
      expiresAt: "2026-08-25T12:00:00.000Z",
    }).priceSourceHash;

  it("ignores the clock reading on the pay-now instalment", () => {
    /*
     * The vendor stamps the first instalment with the moment it answered, so two identical
     * `/offers` calls seconds apart differ here and nowhere else. Hashing it refused every
     * hold on a pay-in-full yacht with PRICE_CHANGED for a price that had not moved.
     */
    expect(hashOf([{ date: "2026-08-25 10:07:18", amount: 5400 }])).toBe(
      hashOf([{ date: "2026-08-25 10:07:29", amount: 5400 }]),
    );
  });

  it("still refuses a quote whose amount moved", () => {
    expect(hashOf([{ date: "2026-08-25 10:07:18", amount: 5400 }])).not.toBe(
      hashOf([{ date: "2026-08-25 10:07:18", amount: 5900 }]),
    );
  });

  it("still refuses a quote whose balance due date moved", () => {
    // A later instalment's date is a term the customer agreed to, not a clock reading:
    // `toPaymentPolicy` reads it into `balanceDueAt`.
    const early = [
      { date: "2026-08-25 10:07:18", amount: 1400 },
      { date: "2026-07-01 00:00:00", amount: 4000 },
    ];
    const late = [
      { date: "2026-08-25 10:07:18", amount: 1400 },
      { date: "2026-08-01 00:00:00", amount: 4000 },
    ];

    expect(hashOf(early)).not.toBe(hashOf(late));
  });
});

const QUOTE_CONFIG: BookingManagerConfig = {
  baseUrl: "https://www.booking-manager.com/api/v2",
  apiToken: "t0ken",
  timeoutMs: 1000,
  syncTimeoutMs: 5000,
  minIntervalMs: 0,
  sweepConcurrency: 1,
  priceWeeksConcurrency: 4,
  optionSafetyMarginMinutes: 15,
  timeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "booking-manager:test",
};

const RUMBA_ID = "123325530000100225";

const rumbaResolver: CatalogueResolver = {
  providerId: () => Promise.resolve("prv_booking_manager"),
  toExternalListing: () =>
    Promise.resolve({
      externalYachtId: RUMBA_ID,
      externalCompanyId: "225",
      externalBaseId: "0",
      listingSourceId: "lsrc_rumba",
    }),
  toExternalYachtIds: () => Promise.reject(new Error("not used by a quote")),
  toListingId: () => Promise.reject(new Error("not used by a quote")),
  toExternalCountryId: () => Promise.reject(new Error("not used by a quote")),
  loadListingSummary: () => Promise.reject(new Error("not used by a quote")),
  listExternalCompanyIds: () => Promise.reject(new Error("not used by a quote")),
  listYachtCompanyScopeKeys: () => Promise.reject(new Error("not used by a quote")),
};

/** A client answering every `/offers` call with `body`, and the URLs it was asked. */
function clientAnswering(body: string) {
  const asked: URL[] = [];
  const client = new BookingManagerClient({
    config: QUOTE_CONFIG,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: (url) => {
      asked.push(new URL(String(url)));
      return Promise.resolve({ status: 200, text: () => Promise.resolve(body) });
    },
  });
  return { client, asked };
}

const RUMBA_WEEK = {
  listingId: "lst_rumba",
  checkIn: "2027-06-05",
  checkOut: "2027-06-12",
  guests: 4,
  extras: [],
  currency: "EUR",
};

/*
 * The listing may keep an older Booking Manager hull beside the one it sells; the bound is looked
 * up by the vendor yacht id `/offers` priced, never by the listing.
 */
describe("getBookingManagerQuote's discount bound", () => {
  const offers =
    `[{"yachtId":${RUMBA_ID},"yacht":"Rumba","startBaseId":0,"endBaseId":0,` +
    '"dateFrom":"2027-06-05 17:00:00","dateTo":"2027-06-12 09:00:00","status":0,' +
    '"product":"Bareboat","price":4600.0,"currency":"EUR","obligatoryExtras":[],' +
    '"commissionPercentage":15.0,"commissionValue":690.0}]';

  it("asks for the bound of the yacht it priced", async () => {
    const asked: string[] = [];
    const service = createBookingManagerQuoteService({
      client: clientAnswering(offers).client,
      resolver: rumbaResolver,
      config: QUOTE_CONFIG,
      loadDiscountCapPercentage: (externalYachtId) => {
        asked.push(externalYachtId);
        return Promise.resolve(10);
      },
    });

    const quote = await service.getBookingManagerQuote(RUMBA_WEEK);

    expect(asked).toEqual([RUMBA_ID]);
    expect(quote.maxClientDiscount).toEqual({ amountMinor: 6_900, currency: "EUR" });
  });
});

/*
 * A pinned pair the week does not sell is the customer's route refused, not the week: the API
 * takes a week off the card on a plain refusal, which would hide a charter still on sale.
 */
describe("getBookingManagerQuote on a pinned route", () => {
  const offers =
    `[{"yachtId":${RUMBA_ID},"startBaseId":0,"endBaseId":0,` +
    '"dateFrom":"2027-06-05 17:00:00","dateTo":"2027-06-12 09:00:00",' +
    '"product":"Bareboat","price":4600.0,"currency":"EUR","obligatoryExtras":[]}]';
  const quoteOn = (route: { startBaseId?: string; endBaseId?: string }, body = offers) =>
    createBookingManagerQuoteService({
      client: clientAnswering(body).client,
      resolver: rumbaResolver,
      config: QUOTE_CONFIG,
    }).getBookingManagerQuote({ ...RUMBA_WEEK, ...route });

  it("prices the pair asked for", async () => {
    const quote = await quoteOn({ startBaseId: "0", endBaseId: "0" });
    expect(quote.route).toEqual({ startBaseId: "0", endBaseId: "0" });
  });

  it("refuses only the route when the week is sold on another pair", async () => {
    const error = await providerRejection(quoteOn({ startBaseId: "0", endBaseId: "25" }));
    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(refusesOnlyTheRoute(error)).toBe(true);
  });

  it("refuses the week when nothing is on sale", async () => {
    const error = await providerRejection(quoteOn({ startBaseId: "0" }, "[]"));
    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(refusesOnlyTheRoute(error)).toBe(false);
  });
});

/*
 * Without `productName` the vendor prices its own default, which is the product the catalogue
 * shows too, until the operator changes it. Named on the call, the quote and the reservation
 * agree on one product whatever the default is by then.
 */
describe("getBookingManagerQuote's product", () => {
  const offers =
    `[{"yachtId":${RUMBA_ID},"startBaseId":0,"endBaseId":0,` +
    '"dateFrom":"2027-06-05 17:00:00","dateTo":"2027-06-12 09:00:00",' +
    '"product":"Bareboat","price":4600.0,"currency":"EUR","obligatoryExtras":[]}]';

  it("asks /offers for the listing's product", async () => {
    const { client, asked } = clientAnswering(offers);
    await createBookingManagerQuoteService({
      client,
      resolver: rumbaResolver,
      config: QUOTE_CONFIG,
      loadProductName: () => Promise.resolve("Bareboat"),
    }).getBookingManagerQuote(RUMBA_WEEK);

    expect(asked[0]?.searchParams.get("productName")).toBe("Bareboat");
  });

  it("leaves the product to the vendor where the listing names none", async () => {
    const { client, asked } = clientAnswering(offers);
    await createBookingManagerQuoteService({
      client,
      resolver: rumbaResolver,
      config: QUOTE_CONFIG,
      loadProductName: () => Promise.resolve(undefined),
    }).getBookingManagerQuote(RUMBA_WEEK);

    expect(asked[0]?.searchParams.has("productName")).toBe(false);
  });

  it("refuses an answer for another product", async () => {
    const { client } = clientAnswering(offers);
    const error = await providerRejection(
      createBookingManagerQuoteService({
        client,
        resolver: rumbaResolver,
        config: QUOTE_CONFIG,
        loadProductName: () => Promise.resolve("Crewed"),
      }).getBookingManagerQuote(RUMBA_WEEK),
    );

    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(error.providerCode).toBe("NO_OFFER");
  });
});

/*
 * West Wind on company 225, week of 5 June 2027, asked in GBP. The vendor converts the charter,
 * its plan and its discount at one rate (0.8698) and the extras and the deposit at another
 * (0.8454), so every total is built from the lines it returned and nothing is converted here.
 */
describe("a quote the vendor converted", () => {
  const [westWind] = restOfferListSchema.parse(
    parseExactJson(
      readFileSync(new URL("fixtures/offers-225-2027-06-05-gbp.json", import.meta.url), "utf8"),
    ),
  );
  if (westWind === undefined) throw new Error("fixture did not parse");
  const quote = mapOfferToProviderQuote({
    offer: westWind,
    listingId: "lst_west_wind",
    checkIn: "2027-06-05",
    checkOut: "2027-06-12",
    guests: 2,
    requestedCurrency: "GBP",
    expiresAt: "2027-05-01T00:00:00.000Z",
  });

  it("prices every line in the money it was asked in", () => {
    expect(quote.currency).toBe("GBP");
    expect(new Set(quote.lines.map((line) => line.amount.currency))).toEqual(new Set(["GBP"]));
  });

  it("totals the charter and the extras as the vendor stated them", () => {
    expect(quote.total.amountMinor).toBe(480_100 + 152_764);
    expect(quote.total.amountMinor).toBe(
      quote.lines.reduce((sum, line) => sum + line.amount.amountMinor, 0),
    );
  });

  it("takes the deposit off the plan, which follows the charter's rate", () => {
    expect(quote.deposit).toEqual({ amountMinor: 240_050, currency: "GBP" });
    expect(quote.paymentPolicy).toMatchObject({ mode: "deposit", depositPct: 0.5 });
  });

  it("drops a discount whose steps were rounded at another rate than the price", () => {
    // 8% of 5,219 is 417.52, while the rounded price leaves 418 between the two figures.
    expect(quote.lines.filter((line) => line.kind === "discount")).toEqual([]);
    expect(charterPriceOf(quote)).toEqual({ amountMinor: 480_100, currency: "GBP" });
  });
});
