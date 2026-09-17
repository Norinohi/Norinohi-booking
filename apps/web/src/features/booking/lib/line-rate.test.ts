import { describe, expect, it } from "vitest";

import { type RateSource, vendorRateFor } from "./line-rate";

const touristTax: RateSource = {
  code: "service:763940275201136",
  price: { amountMinor: 133, currency: "EUR" },
  priceToMinor: null,
  priceMeasure: "per_night",
  percentage: null,
};

/* NB-TBV6TK43: 1.33 per night over seven nights, the vendor's own total. */
const line = {
  code: "service:763940275201136",
  amount: { amountMinor: 931, currency: "EUR" },
};

describe("vendorRateFor", () => {
  it("names the vendor's unit behind the total, whatever the fee is called", () => {
    expect(vendorRateFor(line, [touristTax])).toEqual({
      amountMinor: 133,
      currency: "EUR",
      measure: "per_night",
    });
  });

  it("leaves the total unexplained where the catalogue cannot say what it is per", () => {
    expect(vendorRateFor(line, [])).toBeNull();
    expect(vendorRateFor(line, [{ ...touristTax, priceMeasure: null }])).toBeNull();
    expect(vendorRateFor(line, [{ ...touristTax, priceMeasure: " " }])).toBeNull();
    expect(vendorRateFor(line, [{ ...touristTax, percentage: 0.05 }])).toBeNull();
    expect(vendorRateFor(line, [{ ...touristTax, priceToMinor: 200 }])).toBeNull();
    expect(
      vendorRateFor(line, [{ ...touristTax, price: { amountMinor: 133, currency: "USD" } }]),
    ).toBeNull();
    expect(
      vendorRateFor(line, [{ ...touristTax, price: { amountMinor: 0, currency: "EUR" } }]),
    ).toBeNull();
  });
});
