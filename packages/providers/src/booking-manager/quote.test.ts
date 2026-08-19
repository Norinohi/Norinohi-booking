import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { restExtrasSchema, restOfferSchema } from "./endpoints";
import { mapOfferToProviderQuote, type OfferMapping } from "./quote";

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

function mappingFor(extra: ExtraInput, labelFor?: OfferMapping["labelFor"]): OfferMapping {
  return {
    offer: offerWith(extra),
    listingId: "lst_1",
    checkIn: "2026-06-01",
    checkOut: "2026-06-08",
    guests: 4,
    requestedCurrency: "EUR",
    expiresAt: "2026-05-01T00:00:00.000Z",
    labelFor,
  };
}

describe("mapOfferToProviderQuote extras", () => {
  const cleaning = { id: "77", price: 150, obligatory: true };

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
