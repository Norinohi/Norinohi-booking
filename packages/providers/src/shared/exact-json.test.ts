import { describe, expect, it } from "vitest";

import { ContractError } from "./errors";
import { exactJsonNumber, exactJsonSupported, parseExactJson } from "./exact-json";

describe("exactJsonSupported", () => {
  it("is true on the runtime the repo pins", () => {
    expect(exactJsonSupported()).toBe(true);
  });
});

describe("parseExactJson", () => {
  /* Real values measured against the live Booking Manager account on 2026-08-19. */
  it.each([
    ["6614004890000100225", "a /yachts id whose last three digits are lost"],
    ["7924403030000100120", "an /availability id rounded down to zeros"],
    ["9046281455002103", "a yachtId that rounds onto a different valid id"],
  ])("keeps %s exact (%s)", (digits) => {
    expect(parseExactJson(`{"id":${digits}}`)).toEqual({ id: digits });
    // The defect this exists to prevent, stated directly.
    expect(String(JSON.parse(`{"id":${digits}}`).id)).not.toBe(digits);
  });

  it("leaves an integer that round-trips as a number", () => {
    // 18 digits, but trailing zeros make it exactly representable, so nothing is
    // gained by turning it into a string and a lot of call sites are spared.
    expect(parseExactJson('{"id":183988300000100000}')).toEqual({ id: 183988300000100000 });
  });

  it.each([
    ["small integers", '{"n":225}', { n: 225 }],
    ["negatives", '{"n":-42}', { n: -42 }],
    ["floats", '{"n":1234.5}', { n: 1234.5 }],
    ["exponents", '{"n":1e3}', { n: 1000 }],
    ["strings", '{"s":"225"}', { s: "225" }],
    ["null", '{"n":null}', { n: null }],
    ["booleans", '{"b":true}', { b: true }],
  ])("leaves %s alone", (_label, text, expected) => {
    expect(parseExactJson(text)).toEqual(expected);
  });

  /*
   * The trap a regex over raw JSON falls into. The engine tokenizes here, so a digit
   * run inside a string is never mistaken for a number.
   */
  it("does not touch digits inside string values", () => {
    expect(parseExactJson('{"remarks":"call 9046281455002103 to confirm"}')).toEqual({
      remarks: "call 9046281455002103 to confirm",
    });
  });

  it("preserves ids nested in arrays and objects", () => {
    expect(
      parseExactJson('[{"yachtId":9046281455002103,"equipmentIds":[6614004890000100225]}]'),
    ).toEqual([{ yachtId: "9046281455002103", equipmentIds: ["6614004890000100225"] }]);
  });

  it("still rejects malformed JSON", () => {
    expect(() => parseExactJson("{not json")).toThrow();
  });
});

describe("exactJsonNumber", () => {
  it("emits an exact unquoted integer, which is what the vendor's Long expects", () => {
    expect(JSON.stringify({ yachtId: exactJsonNumber("6614004890000100225") })).toBe(
      '{"yachtId":6614004890000100225}',
    );
  });

  it("round-trips through the parser without drift", () => {
    const id = "9046281455002103";
    const body = JSON.stringify({ yachtId: exactJsonNumber(id) });

    expect(parseExactJson(body)).toEqual({ yachtId: id });
  });

  it("accepts a number as well as a digit string", () => {
    expect(JSON.stringify({ id: exactJsonNumber(225) })).toBe('{"id":225}');
  });

  /*
   * Refused rather than passed through: a lenient version returns something the type
   * system cannot tell from a marker, and a quoted id in a `Long` field is a booking
   * the vendor rejects for reasons invisible from our side.
   */
  it("refuses a value that is not an integer id", () => {
    expect(() => exactJsonNumber("abc")).toThrow(ContractError);
  });
});
