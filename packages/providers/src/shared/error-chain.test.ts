import { describe, expect, it } from "vitest";

import { describeErrorChain } from "./error-chain";

/*
 * The rule these all serve: `sync_error.message` is stored truncated, so whatever explains the
 * failure has to come first. A real unique violation was once undiagnosable because Drizzle's
 * message opens with the whole statement and pushed the driver's complaint past the cap.
 */

/** Shaped like the `pg` error Drizzle wraps: the specifics ride on properties, not in the text. */
function pgError(message: string, extra: { code?: string; constraint?: string } = {}): Error {
  return Object.assign(new Error(message), extra);
}

describe("describeErrorChain", () => {
  it("puts the driver's complaint ahead of the statement that carried it", () => {
    const cause = pgError(
      'duplicate key value violates unique constraint "listing_price_period_uq"',
      {
        code: "23505",
        constraint: "listing_price_period_uq",
      },
    );
    const wrapper = new Error(
      `Failed query: insert into "listing_price_period" ${"$1, ".repeat(400)}`,
      {
        cause,
      },
    );

    const described = describeErrorChain(wrapper);

    // What matters is that truncating to the stored length keeps the useful half.
    expect(described.slice(0, 2000)).toContain("duplicate key value");
    expect(described.slice(0, 2000)).toContain("listing_price_period_uq");
    expect(described.indexOf("duplicate key value")).toBeLessThan(
      described.indexOf("Failed query"),
    );
  });

  it("carries the code and constraint, which name where to look", () => {
    expect(describeErrorChain(pgError("nope", { code: "23505", constraint: "some_uq" }))).toBe(
      "nope [23505 some_uq]",
    );
  });

  it("leaves an ordinary error alone", () => {
    expect(describeErrorChain(new Error("plain failure"))).toBe("plain failure");
  });

  it("keeps every link, so the outer context is still there after the cause", () => {
    const chain = new Error("outer", { cause: new Error("middle", { cause: new Error("root") }) });

    expect(describeErrorChain(chain)).toBe("root ← middle ← outer");
  });

  it("ignores a cause that is not an error", () => {
    expect(describeErrorChain(new Error("outer", { cause: "just a string" }))).toBe("outer");
  });

  it("survives a cause cycle rather than repeating itself", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    Object.assign(first, { cause: second });

    // Stops at the repeat: two links, not MAX_DEPTH copies of the same pair.
    expect(describeErrorChain(first)).toBe("second ← first");
  });
});
