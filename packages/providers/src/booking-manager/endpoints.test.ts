import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { z } from "zod";

import { parseExactJson } from "../shared/exact-json";
import { restIdListSchema, restYachtSchema } from "./endpoints";

/** Overrides typed from the schema itself, so a fixture cannot drift from its input. */
type YachtInput = z.input<typeof restYachtSchema>;

const yacht = (over: Partial<YachtInput> = {}) => ({ id: "1188200267800225", ...over });

describe("restYachtSchema ids", () => {
  /* A real id from the live account; JSON.parse would make it ...100000. */
  it("keeps a 19-digit id exactly as the parser handed it over", () => {
    expect(restYachtSchema.parse(yacht({ id: "6614004890000100225" })).id).toBe(
      "6614004890000100225",
    );
  });

  it("accepts the numeric form for an id that round-trips", () => {
    // 18 digits, but trailing zeros make it exactly representable, so `parseExactJson`
    // leaves it a number and the schema still has to take it.
    expect(restYachtSchema.parse(yacht({ id: 183988300000100000 })).id).toBe("183988300000100000");
  });

  it("refuses a number too large to stringify as digits", () => {
    // From 1e21 `String` switches to exponential, and "1e+21" is not an id.
    expect(() => restYachtSchema.parse(yacht({ id: 1e21 }))).toThrow();
  });

  it("refuses a non-integer id", () => {
    expect(() => restYachtSchema.parse(yacht({ id: "not-an-id" }))).toThrow();
  });

  /*
   * The amenity code the resolver splits back apart to name an extra to the vendor is
   * built from this id, so a rounded one here is a wrong extra rather than a cosmetic
   * difference.
   */
  it("keeps a nested equipment id exact", () => {
    const parsed = restYachtSchema.parse(
      yacht({ equipment: [{ id: "6614004890000100225", value: "" }] }),
    );

    expect(parsed.equipment?.[0]?.id).toBe("6614004890000100225");
  });
});

describe("restYachtSchema equipment value", () => {
  /*
   * The vendor sends the same field both ways: `"2"` on 119,571 observed rows and `2`
   * on 2,107. Declaring it text refused the numeric ones, which failed an account-wide
   * `/yachts` fetch outright and silently cost whichever company owned them otherwise.
   */
  it.each([
    ["a string", "2", "2"],
    ["a number", 2, "2"],
    ["an empty string", "", ""],
    ["zero", 0, "0"],
  ])("accepts %s and settles on text", (_label, value, expected) => {
    const parsed = restYachtSchema.parse(yacht({ equipment: [{ id: "7", value }] }));

    expect(parsed.equipment?.[0]?.value).toBe(expected);
  });

  it("tolerates an explicit null", () => {
    expect(() =>
      restYachtSchema.parse(yacht({ equipment: [{ id: "7", value: null }] })),
    ).not.toThrow();
  });

  it("tolerates the key being absent", () => {
    expect(() => restYachtSchema.parse(yacht({ equipment: [{ id: "7" }] }))).not.toThrow();
  });

  it("applies the same rule to equipmentRaw", () => {
    const parsed = restYachtSchema.parse(
      yacht({ equipmentRaw: [{ id: "7", name: "Bimini", value: 1 }] }),
    );

    expect(parsed.equipmentRaw?.[0]?.value).toBe("1");
  });
});

describe("restIdListSchema", () => {
  it("reads ids without validating anything else about the row", () => {
    const rows = parseExactJson('[{"id":6614004890000100225,"junk":{"nested":true}}]');

    expect(restIdListSchema.parse(rows)[0]?.id).toBe("6614004890000100225");
  });
});
