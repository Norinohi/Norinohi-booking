import { describe, expect, it } from "vitest";

import { stripLocalePrefix } from "./locale-path";

describe("stripLocalePrefix", () => {
  it("drops the locale segment", () => {
    expect(stripLocalePrefix("/en")).toBe("/");
    expect(stripLocalePrefix("/uk/yachts")).toBe("/yachts");
    expect(stripLocalePrefix("/es/yachts/lagoon-42/booking")).toBe("/yachts/lagoon-42/booking");
  });

  it("drops only one segment, so a switch never stacks prefixes", () => {
    expect(stripLocalePrefix("/de/en")).toBe("/en");
  });

  it("keeps a path without a locale", () => {
    expect(stripLocalePrefix("/yachts")).toBe("/yachts");
    expect(stripLocalePrefix("/")).toBe("/");
    expect(stripLocalePrefix("")).toBe("/");
  });
});
