import { describe, expect, it } from "vitest";

import { placeLine, placeLineExcept } from "./place-line";

describe("placeLine", () => {
  it("prints a NauSYS base, whose name is its location path, once", () => {
    const path = "Bahamas, Abacos, Boat Harbour Marina";
    expect(placeLine(path, path, "Bahamas")).toBe(path);
  });

  it("leaves a Booking Manager line alone, where nothing overlaps", () => {
    expect(placeLine("Nha Trang, Khánh Hòa / Ana Marina Marina", "SE Asia", "Viet Nam")).toBe(
      "Nha Trang, Khánh Hòa / Ana Marina Marina, SE Asia, Viet Nam",
    );
  });

  it("folds accents and case, so one place is not two", () => {
    expect(placeLine("Šibenik, Marina Zaton", "Sibenik", "Croatia")).toBe(
      "Šibenik, Marina Zaton, Croatia",
    );
  });

  it("keeps the first spelling and the caller's order", () => {
    expect(placeLine("Trogir", "Trogir", "Croatia")).toBe("Trogir, Croatia");
  });

  it("drops blanks and absent parts rather than printing stray commas", () => {
    expect(placeLine("Marina Kastela", null, "  ", undefined, "Croatia")).toBe(
      "Marina Kastela, Croatia",
    );
  });
});

describe("placeLineExcept", () => {
  it("says nothing when the marina's name already covered it", () => {
    const path = "Bahamas, Abacos, Boat Harbour Marina";
    expect(placeLineExcept(path, path)).toBe("");
  });

  it("keeps a location the name does not contain", () => {
    expect(placeLineExcept("Nha Trang, Khánh Hòa / Ana Marina Marina", "SE Asia")).toBe("SE Asia");
  });

  it("keeps only the part that is new", () => {
    expect(placeLineExcept("Marina Punat, Krk", "Krk, Kvarner")).toBe("Kvarner");
  });
});
