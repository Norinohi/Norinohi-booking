import { describe, expect, it } from "vitest";

import {
  baseExtraCode,
  formatExtraCode,
  formatExtraVariantCode,
  parseExtraCode,
} from "./extra-code";

describe("extra codes", () => {
  it("round-trips a plain code", () => {
    expect(parseExtraCode(formatExtraCode("service", "100511"))).toEqual({
      kind: "service",
      externalId: "100511",
    });
  });

  it("round-trips a variant code", () => {
    const code = formatExtraVariantCode("service", "100511", "66279570");

    expect(code).toBe("service:100511@66279570");
    expect(parseExtraCode(code)).toEqual({
      kind: "service",
      externalId: "100511",
      variantId: "66279570",
    });
  });

  it("refuses a variant separator with nothing on one side of it", () => {
    expect(parseExtraCode("service:@66279570")).toBeNull();
    expect(parseExtraCode("service:100511@")).toBeNull();
  });

  it("reduces a variant code to the extra it belongs to", () => {
    expect(baseExtraCode("service:100511@66279570")).toBe("service:100511");
    expect(baseExtraCode("equipment:14")).toBe("equipment:14");
  });

  it("leaves a code it cannot read alone", () => {
    expect(baseExtraCode("nausys-discount-3")).toBe("nausys-discount-3");
  });
});
