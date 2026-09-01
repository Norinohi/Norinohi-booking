import { describe, expect, it } from "vitest";

import { mergeYachtTitle, yachtModelSubtitle } from "./yacht-title";

describe("mergeYachtTitle", () => {
  it("joins a boat name to its model", () => {
    expect(mergeYachtTitle("Star Kiss", "Sun Odyssey 350")).toBe("Star Kiss Sun Odyssey 350");
  });

  it("does not repeat a model the vendor already used as the name", () => {
    expect(mergeYachtTitle("Sole", "Sole")).toBe("Sole");
    expect(mergeYachtTitle("Moja Maja", "Moja Maja")).toBe("Moja Maja");
  });

  it("does not repeat a model the name merely contains", () => {
    expect(mergeYachtTitle("Salona 45 Performance", "Salona 45")).toBe("Salona 45 Performance");
    expect(mergeYachtTitle("Bavaria 46", "Bavaria 46")).toBe("Bavaria 46");
  });

  it("ignores case, the two feeds writing the model differently", () => {
    expect(mergeYachtTitle("LAGOON 42", "Lagoon 42")).toBe("LAGOON 42");
  });

  it("falls back to whichever half it has", () => {
    expect(mergeYachtTitle(undefined, "Sun Odyssey 350")).toBe("Sun Odyssey 350");
    expect(mergeYachtTitle("Star Kiss", undefined)).toBe("Star Kiss");
    expect(mergeYachtTitle(undefined, undefined)).toBeUndefined();
  });

  it("treats blank and whitespace as absent, so a title never gains a stray space", () => {
    expect(mergeYachtTitle("Star Kiss", "   ")).toBe("Star Kiss");
    expect(mergeYachtTitle("  ", "Sun Odyssey 350")).toBe("Sun Odyssey 350");
  });
});

describe("yachtModelSubtitle", () => {
  it("is the model when it says something the name does not", () => {
    expect(yachtModelSubtitle("Star Kiss", "Sun Odyssey 350")).toBe("Sun Odyssey 350");
  });

  /* The half that would have been dropped from the title is the half not worth showing. */
  it("is absent exactly where the merged title would not repeat it", () => {
    expect(yachtModelSubtitle("Sole", "Sole")).toBeUndefined();
    expect(yachtModelSubtitle("Salona 45 Performance", "Salona 45")).toBeUndefined();
  });

  it("stands alone when the boat has no name of its own", () => {
    expect(yachtModelSubtitle(undefined, "Sun Odyssey 350")).toBe("Sun Odyssey 350");
  });
});
