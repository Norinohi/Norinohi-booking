import { describe, expect, it } from "vitest";

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
    expect(pickText(restInternationalText, undefined as unknown as string, [])).toBeNull();
  });
});
