import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { readFileSync } from "node:fs";

import type { z } from "zod";

import { parseExactJson } from "../shared/exact-json";
import {
  restCompanySchema,
  restIdListSchema,
  restPriceListSchema,
  restReservationSchema,
  restYachtSchema,
} from "./endpoints";

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

/*
 * Everything below is what company 225 actually sent on 2026-09-21, read through the same exact
 * parser the client uses. These are the keys the v2.2.2 changelog added and the ones the live
 * feed carries without any spec mentioning them; the schemas are loose, so a key they do not
 * declare is kept but unvalidated, and one they spell differently is silently lost.
 */
describe("the v2.2.2 contract against live payloads", () => {
  const westWind = restYachtSchema.parse(
    parseExactJson(
      readFileSync(new URL("fixtures/yacht-225-west-wind.json", import.meta.url), "utf8"),
    ),
  );
  const charterPack = westWind.products
    ?.flatMap((product) => product.extras ?? [])
    .find((extra) => extra.name === "Charter Pack");

  it("keeps modelConfigurationId as text, leading zeros and all", () => {
    expect(westWind.modelConfigurationId).toBe("12882280000100000");
    expect(
      restYachtSchema.parse(yacht({ modelConfigurationId: "03221" })).modelConfigurationId,
    ).toBe("03221");
  });

  it("reads the yacht's undocumented note fields", () => {
    const parsed = restYachtSchema.parse(yacht({ comment: "Pets not allowed", yearNote: "" }));

    expect(parsed).toMatchObject({ comment: "Pets not allowed", yearNote: "" });
  });

  it("keeps an image's 19-digit id exact", () => {
    expect(westWind.images?.[0]?.id).toMatch(/^\d{19}$/);
  });

  it("reads a bundle's included extras as exact ids", () => {
    expect(charterPack?.includedExtras).toEqual(["1488975580000100225", "26877460000100225"]);
  });

  it("reads the quantity fields and the live spelling of the waiver flag", () => {
    expect(charterPack).toMatchObject({
      quantityLimit: -1,
      quantityIsSelectable: false,
      includesDepositWaiver: false,
    });
  });

  it("reads a description's documents under the key the vendor actually sends", () => {
    const parsed = restYachtSchema.parse(
      yacht({
        descriptions: [
          {
            category: "general",
            text: "",
            documents: [
              {
                id: "4469909500000100797",
                name: "deck-plan.jpg",
                url: "https://www.booking-manager.com/cbm/documents/4469910710000100797_deck-plan.jpg",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.descriptions?.[0]?.documents?.[0]?.id).toBe("4469909500000100797");
  });

  it("reads a company's rating and second mobile", () => {
    const company = restCompanySchema.parse(
      parseExactJson(
        '{"id":225,"name":"Demo version","mobile":"","mobile2":"","maxDiscountFromCommissionPercentage":10.0,' +
          '"rating":{"average":0.0,"reviews":0}}',
      ),
    );

    expect(company).toMatchObject({ mobile2: "", rating: { average: 0, reviews: 0 } });
  });

  it("reads a reservation's internal remarks", () => {
    const reservation = restReservationSchema.parse(
      parseExactJson(
        '{"id":8295147120000107113,"charterReservationId":8295147330000100225,"status":2,' +
          '"productName":"Bareboat","baseFromId":127,"baseToId":127,"remarks":"","internalRemarks":""}',
      ),
    );

    expect(reservation).toMatchObject({
      id: "8295147120000107113",
      charterReservationId: "8295147330000100225",
      baseFromId: "127",
      internalRemarks: "",
    });
  });

  it("reads a price's base pair, base 0 included", () => {
    const [rumba, jack] = restPriceListSchema.parse(
      parseExactJson(
        '[{"yachtId":123325530000100225,"startBaseId":0,"endBaseId":0,"dateFrom":"2027-06-05 17:00:00",' +
          '"dateTo":"2027-06-12 09:00:00","product":"Bareboat","price":4600.0,"currency":"EUR"},' +
          '{"yachtId":26876440000100225,"startBaseId":120,"endBaseId":120,"dateFrom":"2027-06-05 17:00:00",' +
          '"dateTo":"2027-06-12 09:00:00","product":"Bareboat","price":5152.0,"currency":"EUR"}]',
      ),
    );

    expect(rumba).toMatchObject({
      yachtId: "123325530000100225",
      startBaseId: "0",
      endBaseId: "0",
    });
    expect(jack).toMatchObject({ startBaseId: "120", endBaseId: "120" });
  });
});
