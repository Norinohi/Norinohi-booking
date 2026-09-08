import { describe, expect, it } from "vitest";

import {
  convertForDisplay,
  type FxSnapshot,
  isStale,
  resolveDisplayCurrency,
} from "./display-currency";

/* Units per euro, the direction both banks publish in. The hryvnia carries a different date
   on purpose: it comes from the National Bank of Ukraine, on its own schedule. */
const snapshot = (over: Partial<FxSnapshot> = {}): FxSnapshot => ({
  base: "EUR",
  maxAgeDays: 7,
  rates: {
    USD: { rate: 1.1, asOf: "2026-09-07" },
    GBP: { rate: 0.85, asOf: "2026-09-07" },
    PLN: { rate: 4.3, asOf: "2026-09-07" },
    UAH: { rate: 45, asOf: "2026-09-08" },
  },
  ...over,
});

const NOW = new Date("2026-09-08T10:00:00.000Z");

describe("resolveDisplayCurrency", () => {
  it("keeps the visitor's own pick over anything detection says", () => {
    expect(resolveDisplayCurrency({ chosen: "USD", country: "PL" })).toBe("USD");
  });

  it("reads the country where nobody has chosen", () => {
    expect(resolveDisplayCurrency({ country: "GB" })).toBe("GBP");
    expect(resolveDisplayCurrency({ country: "UA" })).toBe("UAH");
    expect(resolveDisplayCurrency({ country: "pl" })).toBe("PLN");
  });

  it("puts the euro area on the euro", () => {
    expect(resolveDisplayCurrency({ country: "HR" })).toBe("EUR");
    expect(resolveDisplayCurrency({ country: "DE" })).toBe("EUR");
  });

  it("falls back for a country nobody configured, rather than guessing", () => {
    expect(resolveDisplayCurrency({ country: "JP" })).toBe("EUR");
    expect(resolveDisplayCurrency({})).toBe("EUR");
  });

  it("lets an admin override one country without touching the rest", () => {
    const overrides = { CH: "EUR", JP: "USD" };
    expect(resolveDisplayCurrency({ country: "JP", overrides })).toBe("USD");
    expect(resolveDisplayCurrency({ country: "GB", overrides })).toBe("GBP");
  });

  it("ignores a stored or configured value this build does not offer", () => {
    expect(resolveDisplayCurrency({ chosen: "BTC" })).toBe("EUR");
    expect(resolveDisplayCurrency({ country: "JP", fallback: "XYZ" })).toBe("EUR");
    expect(resolveDisplayCurrency({ country: "JP", fallback: "USD" })).toBe("USD");
  });
});

describe("convertForDisplay", () => {
  const euros = { amountMinor: 100_000, currency: "EUR" };

  it("leaves a price already in the visitor's currency exactly as published", () => {
    expect(convertForDisplay(euros, "EUR", snapshot(), NOW)).toEqual({
      ...euros,
      approximate: false,
    });
  });

  it("converts through the base and marks the result approximate", () => {
    expect(convertForDisplay(euros, "USD", snapshot(), NOW)).toEqual({
      amountMinor: 110_000,
      currency: "USD",
      approximate: true,
    });
  });

  it("converts between two quoted currencies, not just out of the base", () => {
    /* 2,200.00 USD is 2,000.00 EUR is 1,700.00 GBP on these rates. */
    const dollars = { amountMinor: 220_000, currency: "USD" };
    expect(convertForDisplay(dollars, "GBP", snapshot(), NOW).amountMinor).toBe(170_000);
  });

  it("keeps the published price when that rate has gone stale", () => {
    /* A rate that silently froze goes on producing plausible numbers forever, which is worse
       than a price in a currency the visitor has to read twice. */
    const old = snapshot({ rates: { USD: { rate: 1.1, asOf: "2026-08-20" } } });
    expect(convertForDisplay(euros, "USD", old, NOW)).toEqual({ ...euros, approximate: false });
  });

  it("does not let one bank's fresh rate vouch for another's stalled one", () => {
    /* The hryvnia comes from a different bank than everything else. A snapshot dated by its
       newest entry would have hidden a euro table that stopped a fortnight ago. */
    const mixed = snapshot({
      rates: {
        USD: { rate: 1.1, asOf: "2026-08-20" },
        UAH: { rate: 45, asOf: "2026-09-08" },
      },
    });
    expect(convertForDisplay(euros, "UAH", mixed, NOW).approximate).toBe(true);
    expect(convertForDisplay(euros, "USD", mixed, NOW).approximate).toBe(false);

    /* And a conversion between them is only as fresh as its staler half. */
    const dollars = { amountMinor: 110_000, currency: "USD" };
    expect(convertForDisplay(dollars, "UAH", mixed, NOW).currency).toBe("USD");
  });

  it("keeps the published price when the snapshot is missing or missing that currency", () => {
    expect(convertForDisplay(euros, "USD", null, NOW).currency).toBe("EUR");
    const partial = snapshot({ rates: { GBP: { rate: 0.85, asOf: "2026-09-07" } } });
    expect(convertForDisplay(euros, "USD", partial, NOW).currency).toBe("EUR");
  });

  it("refuses a nonsense rate rather than dividing by it", () => {
    const broken = snapshot({ rates: { USD: { rate: 0, asOf: "2026-09-07" } } });
    expect(convertForDisplay(euros, "USD", broken, NOW).currency).toBe("EUR");
  });
});

describe("isStale", () => {
  it("tolerates a run of holidays, which is not a stopped feed", () => {
    expect(isStale("2026-09-03", 7, NOW)).toBe(false);
  });

  it("calls a feed that stopped a fortnight ago stale", () => {
    expect(isStale("2026-08-24", 7, NOW)).toBe(true);
  });

  it("treats an unreadable date as stale, since it cannot be shown to be fresh", () => {
    expect(isStale("not-a-date", 7, NOW)).toBe(true);
  });
});
