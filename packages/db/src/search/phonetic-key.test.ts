import { describe, expect, it } from "vitest";

import { hasCyrillic, phoneticKey } from "./phonetic-key";

describe("phoneticKey", () => {
  it("puts a Cyrillic place name on the same key as its Latin spelling", () => {
    expect(phoneticKey("Шибеник")).toBe(phoneticKey("Šibenik"));
    expect(phoneticKey("Лефкада")).toBe(phoneticKey("Lefkada"));
    expect(phoneticKey("Каштела")).toBe(phoneticKey("Kaštela"));
    expect(phoneticKey("Сукошан")).toBe(phoneticKey("Sukosan"));
    expect(phoneticKey("Пальма")).toBe(phoneticKey("Palma"));
    expect(phoneticKey("Мармарис")).toBe(phoneticKey("Marmaris"));
    expect(phoneticKey("Гувія")).toBe(phoneticKey("Gouvia"));
  });

  it("detects a query typed in Cyrillic", () => {
    expect(hasCyrillic("Шибеник")).toBe(true);
    expect(hasCyrillic("Sibenik")).toBe(false);
  });
});
