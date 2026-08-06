import { describe, expect, it } from "vitest";

import { type SearchCursor, decodeSearchCursor, encodeSearchCursor } from "./cursor";

describe("encode/decode round-trip", () => {
  it.each<SearchCursor>([
    { listingId: "ylst_1", value: 12_345 },
    { listingId: "ylst_1", value: "Adriatic Dream" },
    { listingId: "ylst_1", value: 0 },
    { listingId: "ylst_1", value: "" },
    { listingId: "ylst_1", value: -1.5 },
    { listingId: "ylst_a-b_c", value: "ünïcødé ⛵" },
  ])("survives %j", (cursor) => {
    expect(decodeSearchCursor(encodeSearchCursor(cursor))).toEqual(cursor);
  });

  it("produces url-safe base64 with no padding", () => {
    const encoded = encodeSearchCursor({ listingId: "ylst_1", value: "a/b+c==" });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("decodeSearchCursor rejects bad input", () => {
  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not base64", "!!!!"],
    ["base64 of not-json", Buffer.from("hello", "utf8").toString("base64url")],
    ["json null", Buffer.from("null", "utf8").toString("base64url")],
    ["empty object", Buffer.from("{}", "utf8").toString("base64url")],
    ["missing value", Buffer.from('{"listingId":"ylst_1"}', "utf8").toString("base64url")],
    ["missing listingId", Buffer.from('{"value":1}', "utf8").toString("base64url")],
    ["empty listingId", Buffer.from('{"listingId":"","value":1}', "utf8").toString("base64url")],
    ["json array", Buffer.from("[1,2]", "utf8").toString("base64url")],
  ])("returns undefined for %s", (_label, input) => {
    expect(decodeSearchCursor(input)).toBeUndefined();
  });
});

/*
 * The cursor is attacker-supplied: it arrives as a query parameter and is parsed
 * with `as Partial<SearchCursor>`, which asserts rather than checks. The guard
 * only tests that `value` is not undefined, so any other JSON type passes
 * through to repository.ts, where the keyset comparison runs it through
 * Number() and gets NaN instead of an error.
 *
 * These record what happens today rather than what should. Tightening the guard
 * to `typeof value === "string" | "number"` is a behaviour change: cursors that
 * currently degrade to an unfiltered page would start being rejected.
 */
describe("decodeSearchCursor lets non-scalar value through", () => {
  const withValue = (json: string) => Buffer.from(json, "utf8").toString("base64url");

  it("accepts an object where the type says string | number", () => {
    const decoded = decodeSearchCursor(withValue('{"listingId":"ylst_1","value":{"a":1}}'));

    expect(decoded).toBeDefined();
    expect(decoded?.value).toEqual({ a: 1 });
    expect(Number(decoded?.value)).toBeNaN();
  });

  it("accepts an array", () => {
    const decoded = decodeSearchCursor(withValue('{"listingId":"ylst_1","value":[1,2]}'));
    expect(decoded?.value).toEqual([1, 2]);
  });

  it("accepts a boolean and a null-ish shape", () => {
    expect(decodeSearchCursor(withValue('{"listingId":"ylst_1","value":true}'))?.value).toBe(true);
    // null is not undefined, so it passes the guard.
    expect(decodeSearchCursor(withValue('{"listingId":"ylst_1","value":null}'))?.value).toBeNull();
  });

  it("ignores unknown extra keys rather than rejecting them", () => {
    const decoded = decodeSearchCursor(
      withValue('{"listingId":"ylst_1","value":1,"injected":"x"}'),
    );
    expect(decoded).toEqual({ listingId: "ylst_1", value: 1 });
  });
});
