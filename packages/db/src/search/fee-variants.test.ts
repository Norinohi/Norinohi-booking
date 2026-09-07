import { describe, expect, it } from "vitest";

import { feeVariantKey, foldFeeVariants } from "./repository";

/**
 * Labels copied from production listings, not invented: an operator publishes one fee once per
 * charter year and once per charter length, marks every one of them obligatory, and the section
 * then reads as several charges. POPAJ Elan Impression 45 carried three transit logs totalling
 * 1,210 euro for a single week.
 */
function fee(sourceLabel: string, priceMinor: number) {
  return {
    code: `service:${sourceLabel}`,
    label: sourceLabel,
    sourceLabel,
    priceMinor,
    priceCurrency: "EUR",
    priceMeasure: "per_booking",
    calculationType: null,
    percentage: null,
    payableInBase: true,
    oneWayOnly: false,
  };
}

const fold = (labels: [string, number][]) =>
  foldFeeVariants(
    labels.map(([label, price]) => fee(label, price)),
    "EUR",
  );

describe("feeVariantKey", () => {
  it("meets the same fee written with and without a space", () => {
    expect(feeVariantKey("Transit log")).toBe(feeVariantKey("Transitlog"));
  });

  it("meets the same fee published per charter year", () => {
    expect(feeVariantKey("Transit Log & Final Cleaning Fee 2026")).toBe(
      feeVariantKey("Transit Log & Final Cleaning Fee 2027"),
    );
  });

  it("meets the same fee published per charter length", () => {
    expect(feeVariantKey("Comfort Pack")).toBe(feeVariantKey("Comfort Pack 2 weeks"));
    expect(feeVariantKey("Transit Log 2026 1 week")).toBe(feeVariantKey("Transit Log 2026 3 weeks"));
  });

  /*
   * The line a fold must not cross. These are separate charges on one booking, and merging them
   * would take money off the page rather than stop it being counted twice.
   */
  it("keeps charges that differ by who or what they cover", () => {
    expect(feeVariantKey("Tourist tax (Adults)")).not.toBe(
      feeVariantKey("Tourist tax (kids up to 12 years)"),
    );
    expect(feeVariantKey("Handling Fee (39-42 ft.)")).not.toBe(
      feeVariantKey("Handling Fee 2027 (-42 ft.)"),
    );
    expect(feeVariantKey("Gas (First 31.7) 2")).not.toBe(feeVariantKey("Gas (First 31.7) 3"));
  });
});

describe("foldFeeVariants", () => {
  it("prices a per-length tariff as one row spanning its variants", () => {
    const [row, ...rest] = fold([
      ["Transit Log 2026 1 week", 36_000],
      ["Transit Log 2026  2 weeks", 41_000],
      ["Transit Log 2026  3 weeks", 44_000],
    ]);

    expect(rest).toHaveLength(0);
    expect(row?.price.amountMinor).toBe(36_000);
    expect(row?.priceToMinor).toBe(44_000);
  });

  it("drops the discriminator from a merged row's name", () => {
    const [row] = fold([
      ["Transit Log 2026 1 week", 36_000],
      ["Transit Log 2026  2 weeks", 41_000],
    ]);

    expect(row?.label).toBe("Transit Log");
  });

  /* A fee with no variant keeps the year: it says which tariff the figure is, and nothing else
     on the row does. */
  it("leaves a lone fee's name alone", () => {
    const [row] = fold([["Transit Log & Final Cleaning Fee 2026", 37_000]]);

    expect(row?.label).toBe("Transit Log & Final Cleaning Fee 2026");
  });

  it("folds one fee an operator filed twice", () => {
    const rows = fold([
      ["Transit log", 25_000],
      ["Transitlog", 25_000],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.price.amountMinor).toBe(25_000);
    /* Both variants cost the same, so there is no range to print. */
    expect(rows[0]?.priceToMinor).toBeNull();
  });

  it("keeps a tourist tax split by passenger age as three charges", () => {
    const rows = fold([
      ["Tourist tax (Adults)", 1_000],
      ["Tourist tax (kids 12- 18 years old)", 500],
      ["Tourist tax (kids up to 12 years)", 0],
    ]);

    expect(rows).toHaveLength(3);
  });
});
