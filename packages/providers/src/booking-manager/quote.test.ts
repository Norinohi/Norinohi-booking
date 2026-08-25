import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { bookingDraftSchema } from "../types";
import { restExtrasSchema, restOfferSchema } from "./endpoints";
import {
  mapOfferToProviderQuote,
  type OfferMapping,
  repriceRequestFor,
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

  it("ignores offers the vendor echoed for other dates", () => {
    const otherWeek = restOfferSchema.parse({
      ...JSON.parse(JSON.stringify(sameBase)),
      dateFrom: "2026-10-03 15:00:00",
      dateTo: "2026-10-10 09:00:00",
    });

    expect(selectOffer([otherWeek], "9001", "2026-09-26", "2026-10-03", undefined)).toBeUndefined();
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
        endBaseId: "100",
      },
    );
  });

  it("asks unfiltered where the provider named no bases", () => {
    expect(repriceRequestFor(draft(null), "EUR")).not.toHaveProperty("endBaseId");
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
