import { describe, expect, it } from "vitest";

import { docHasMainsail, hasMainsail } from "./mainsail";

describe("hasMainsail", () => {
  it("keeps the row for a sailing group with no stated sail type", () => {
    expect(hasMainsail("Sailing yacht", null)).toBe(true);
    expect(hasMainsail("Catamaran", null)).toBe(true);
  });

  it("drops it for motor groups and unknown categories with no stated sail type", () => {
    expect(hasMainsail("Motor boat", null)).toBe(false);
    expect(hasMainsail("Motor yacht", null)).toBe(false);
    expect(hasMainsail("Gulet", null)).toBe(false);
    expect(hasMainsail(null, null)).toBe(false);
  });

  it("keeps a sail type the vendor stated, whatever the group", () => {
    expect(hasMainsail("Gulet", "furling/roll")).toBe(true);
  });

  it.each([
    ["en", "Sailing yacht", "Motor boat"],
    ["uk", "Вітрильна яхта", "Моторний човен"],
    ["de", "Segelyacht", "Motorboot"],
    ["es", "Velero", "Lancha motora"],
  ])("decides on the English group for a doc localized to %s", (_locale, sailing, motor) => {
    const localized = (category: string, categoryKey: string) =>
      docHasMainsail({ category, categoryKey, sailType: null });

    expect(localized(sailing, "Sailing yacht")).toBe(true);
    expect(localized(motor, "Motor boat")).toBe(false);
  });

  it("reads `category` on a doc that was never localized", () => {
    expect(docHasMainsail({ category: "Catamaran", sailType: null })).toBe(true);
    expect(docHasMainsail({ category: "Motor yacht", sailType: null })).toBe(false);
  });
});
