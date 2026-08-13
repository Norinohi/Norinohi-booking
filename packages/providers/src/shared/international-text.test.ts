import { describe, expect, it } from "vitest";

import { contractViolation } from "../testing/contracts";

import { pickText, toLocaleMap } from "./international-text";

const restInternationalText = {
  textEN: "Comfortable catamaran",
  textDE: "Komfortabler Katamaran",
  textHR: "Udoban katamaran",
  textIT: "  Catamarano confortevole  ",
  textSI: "Udoben katamaran",
  textFR: "   ",
  textES: null,
  id: 1234,
};

describe("toLocaleMap", () => {
  it("maps textXX keys to lowercase locale tags", () => {
    expect(toLocaleMap(restInternationalText)).toEqual({
      en: "Comfortable catamaran",
      de: "Komfortabler Katamaran",
      hr: "Udoban katamaran",
      it: "Catamarano confortevole",
      sl: "Udoben katamaran",
    });
  });

  it("maps textSI to the Slovenian language tag sl", () => {
    expect(toLocaleMap({ textSI: "Slovensko" })).toEqual({ sl: "Slovensko" });
  });

  it("maps the country-code keys that differ from their language tag", () => {
    // textSE is Swedish; the bare tag `se` means Northern Sami, so passing it
    // through would mislabel the text rather than merely fail to find it.
    expect(toLocaleMap({ textCZ: "Cesky", textSE: "Svenska" })).toEqual({
      cs: "Cesky",
      sv: "Svenska",
    });
  });

  it("carries every language the vendor sends, not just the common five", () => {
    // RestInternationalText defines 18 languages; the mapper is pattern-based so
    // a vendor adding a nineteenth needs no code change.
    const all = toLocaleMap({
      textHR: "hr",
      textEN: "en",
      textDE: "de",
      textIT: "it",
      textSI: "si",
      textRU: "ru",
      textCZ: "cz",
      textFR: "fr",
      textHU: "hu",
      textPL: "pl",
      textSK: "sk",
      textNL: "nl",
      textTR: "tr",
      textES: "es",
      textSE: "se",
      textNO: "no",
      textLV: "lv",
      textLT: "lt",
    });

    expect(Object.keys(all).sort()).toEqual(
      [
        "cs",
        "de",
        "en",
        "es",
        "fr",
        "hr",
        "hu",
        "it",
        "lt",
        "lv",
        "nl",
        "no",
        "pl",
        "ru",
        "sk",
        "sv",
        "sl",
        "tr",
      ].sort(),
    );
  });

  it("tolerates non-object input", () => {
    expect(toLocaleMap(null)).toEqual({});
    expect(toLocaleMap(undefined)).toEqual({});
    expect(toLocaleMap("text")).toEqual({});
    expect(toLocaleMap([{ textEN: "x" }])).toEqual({});
    expect(toLocaleMap({})).toEqual({});
  });
});

describe("pickText", () => {
  it("prefers the requested locale", () => {
    expect(pickText(restInternationalText, "de")).toBe("Komfortabler Katamaran");
    expect(pickText(restInternationalText, "DE")).toBe("Komfortabler Katamaran");
    expect(pickText(restInternationalText, "de-AT")).toBe("Komfortabler Katamaran");
  });

  it("falls back to HR when EN is missing", () => {
    const croatianOnly = { textHR: "Udoban katamaran", textSI: "Udoben katamaran" };

    expect(pickText(croatianOnly, "en")).toBe("Udoban katamaran");
  });

  it("walks the fallback order in turn", () => {
    expect(pickText({ textSI: "Samo slovensko" }, "en")).toBe("Samo slovensko");
    expect(pickText(restInternationalText, "fr")).toBe("Comfortable catamaran");
  });

  it("honours a custom fallback order", () => {
    expect(pickText(restInternationalText, "fr", ["it", "en"])).toBe("Catamarano confortevole");
  });

  it("returns null instead of throwing when nothing matches", () => {
    expect(pickText(null, "en")).toBeNull();
    expect(pickText(undefined, "en")).toBeNull();
    expect(pickText({}, "en")).toBeNull();
    expect(pickText({ textFR: "   " }, "fr")).toBeNull();
    expect(pickText(restInternationalText, contractViolation(undefined), [])).toBeNull();
  });
});
