import { describe, expect, it } from "vitest";

import { toSlug } from "./catalog-pages";

describe("toSlug", () => {
  it("folds diacritics instead of dropping them", () => {
    /* `slugify` in the providers package leaves these as mali-lo-inj, ka-tela, ibenik. */
    expect(toSlug("Mali Lošinj")).toBe("mali-losinj");
    expect(toSlug("Kaštela")).toBe("kastela");
    expect(toSlug("Šibenik")).toBe("sibenik");
    expect(toSlug("Göcek")).toBe("gocek");
  });

  it("drops apostrophes rather than turning them into separators", () => {
    expect(toSlug("St. George's")).toBe("st-georges");
    expect(toSlug("Marina D'Arechi")).toBe("marina-darechi");
  });

  it("collapses punctuation and trims the edges", () => {
    expect(toSlug("Marina Zadar (ex. Tankerkomerc)")).toBe("marina-zadar-ex-tankerkomerc");
    expect(toSlug("Dubrovnik, Komolac, ACI Marina Dubrovnik")).toBe(
      "dubrovnik-komolac-aci-marina-dubrovnik",
    );
    expect(toSlug("  Sailing yacht  ")).toBe("sailing-yacht");
  });

  it("keeps two catalogue values apart when only their accents differ from a third", () => {
    /* Distinctness matters more than prettiness: colliding slugs silently lose a page. */
    expect(toSlug("Split")).not.toBe(toSlug("Split region"));
  });
});
