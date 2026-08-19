import { z } from "zod";

import { ContractError } from "./errors";
import "./json-source";
import type { JsonValue } from "./json";

/**
 * JSON parsing and serialization that does not quietly round large integers.
 *
 * Booking Manager identifies yachts, bases and reservations with values up to 19
 * digits. `JSON.parse` gives those to a float64, which holds 15-16 digits: measured
 * against the live account on 2026-08-19, 197,615 of 239,442 `yachtId` values in one
 * year's occupancy dump do not survive the round trip, and neither do 163 of 368
 * `/yachts` ids. `6614004890000100225` comes back as `6614004890000100000`.
 *
 * That was invisible for two reasons. Both sides of a comparison round identically,
 * so our own records match each other and availability resolves; and the rounded form
 * is still a plausible-looking id. What breaks is the direction nothing local checks:
 * a quote or a booking sends that id back, and the vendor is being told about a boat
 * whose id we made up. `9046281455002103` rounds to `9046281455002104` - a value that
 * can be another real yacht, not merely a missing one.
 *
 * Both halves need V8's JSON source-access APIs (Node 22+), which is why the repo
 * pins a Node version. There is no fallback on purpose: the failure mode of guessing
 * is a booking against the wrong boat, so an environment that cannot do this must say
 * so rather than carry on.
 */

const probeSchema = z.object({ n: z.literal("9046281455002103") });

const SUPPORTED = (() => {
  try {
    const parsed = JSON.parse(
      '{"n":9046281455002103}',
      (_key, value, context) => context?.source ?? value,
    );
    if (!probeSchema.safeParse(parsed).success) return false;
    return JSON.stringify({ n: JSON.rawJSON("9046281455002103") }) === '{"n":9046281455002103}';
  } catch {
    return false;
  }
})();

export class ExactJsonUnsupportedError extends Error {
  constructor() {
    super(
      "This runtime cannot parse JSON without rounding large integers: " +
        "JSON source access and JSON.rawJSON are required (Node 22+). " +
        "Provider ids up to 19 digits would be silently corrupted.",
    );
    this.name = "ExactJsonUnsupportedError";
  }
}

export function exactJsonSupported(): boolean {
  return SUPPORTED;
}

/**
 * True when a numeric literal's digits do not survive `JSON.parse`.
 *
 * Compared as text rather than by magnitude: `Number.MAX_SAFE_INTEGER` is the bound
 * on *consecutive* representable integers, and plenty of larger ids round-trip fine
 * because they end in zeros. Rewriting those too would turn every long id into a
 * string for no reason and make the change far wider than the defect.
 */
function losesPrecision(source: string): boolean {
  return String(Number(source)) !== source;
}

const INTEGER_LITERAL = /^-?\d+$/;

/**
 * Parses `text`, yielding integer literals that would round as exact digit strings
 * and leaving every other value exactly as `JSON.parse` would.
 *
 * The engine does the tokenizing, so a digit run inside a string value is never
 * mistaken for a number - which is the trap any regex over raw JSON falls into.
 */
export function parseExactJson(text: string): JsonValue {
  if (!SUPPORTED) throw new ExactJsonUnsupportedError();

  /*
   * Declared as `JsonValue` rather than `unknown`. The reviver only ever swaps a
   * number for its own digit string, so the result is exactly the shape `JSON.parse`
   * would have produced - which is the same claim the standard library makes when it
   * types `JSON.parse` as `any`, stated more narrowly.
   */
  // SAFETY: the reviver only ever swaps a number for its own digit string, so the
  // result is exactly the JSON value `JSON.parse` would have produced. The declared
  // overload returns `unknown` because it is general; here the shape is established by
  // construction.
  return JSON.parse(text, (_key, value, context) => {
    // Branching on the literal text rather than on `value`: only a number has an
    // integer-literal source (a string value's source carries its quotes), so this is
    // both the narrower test and the one that avoids inspecting half a million nodes.
    const source = context?.source;
    if (source === undefined || !INTEGER_LITERAL.test(source)) return value;
    return losesPrecision(source) ? source : value;
  }) as JsonValue;
}

/**
 * Marks an id for serialization as a JSON number carrying its exact digits.
 *
 * The vendor declares these fields as `Long`, so they must go out unquoted;
 * `JSON.stringify` on a number would re-round the very value we preserved on the way
 * in, and a string would arrive quoted.
 *
 * Refuses anything that is not an integer literal rather than passing it through.
 * Every caller has already validated the id, and a lenient version here would return
 * a value the type system could not distinguish from a marker - which is how a quoted
 * id reaches a `Long` field and the vendor rejects a booking for reasons nobody can
 * see from our side.
 */
export function exactJsonNumber(id: string | number): RawJSON {
  if (!SUPPORTED) throw new ExactJsonUnsupportedError();

  const source = String(id);
  if (!INTEGER_LITERAL.test(source)) {
    throw new ContractError(`Not an integer id: ${JSON.stringify(id)}`);
  }
  return JSON.rawJSON(source);
}
