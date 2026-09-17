import { describe, expect, it } from "vitest";

import { baseLabel, type FacetTranslator } from "./localize";

const copy = new Map([
  ["location:Lavrion - Olympic Marine", "Lavrion - Marina olímpica"],
  ["location:Bodrum", "Bodrum ES"],
  ["marina:D-Marin Turgutreis", "D-Marin Turgutreis ES"],
]);
const translate: FacetTranslator = (kind, value) => copy.get(`${kind}:${value}`) ?? value;

describe("baseLabel", () => {
  it("follows the location's copy for a base named after it", () => {
    expect(baseLabel(translate, "Lavrion - Olympic Marine", "Lavrion - Olympic Marine")).toBe(
      "Lavrion - Marina olímpica",
    );
  });

  it("keeps a real base name apart from its location", () => {
    expect(baseLabel(translate, "Lavrion Marina", "Lavrion")).toBe("Lavrion Marina");
    expect(baseLabel(translate, "D-Marin Turgutreis", "Bodrum")).toBe("D-Marin Turgutreis ES");
  });
});
