import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { ContractError } from "../shared/errors";
import { buildExactIdIndex, exactIdFor } from "./repair-ids";

/* Real ids from the live account, 2026-08-19. */
const EXACT = "6614004890000100225";
const ROUNDED = "6614004890000100000";

describe("buildExactIdIndex", () => {
  it("maps the rounded form back to the exact id", () => {
    expect(buildExactIdIndex([EXACT]).get(ROUNDED)).toBe(EXACT);
  });

  it("maps an id that already round-trips to itself", () => {
    // 16 digits but under 2^53, so JSON.parse never touched it.
    expect(buildExactIdIndex(["1188200267800225"]).get("1188200267800225")).toBe(
      "1188200267800225",
    );
  });

  /*
   * The safety property the whole repair rests on. Rounding is deterministic but not
   * injective in general - `9046281455002103` and `9046281455002104` share a form - so
   * where the vendor's own data collides the stored value cannot say which yacht it
   * was, and picking one would point a listing at the wrong boat.
   */
  it("refuses to guess when two exact ids share a rounded form", () => {
    expect(() => buildExactIdIndex(["9046281455002103", "9046281455002104"])).toThrow(
      ContractError,
    );
  });

  it("names the ambiguity so it can be taken to the vendor", () => {
    expect(() => buildExactIdIndex(["9046281455002103", "9046281455002104"])).toThrow(
      /9046281455002103/,
    );
  });

  it("tolerates the same id listed twice", () => {
    expect(buildExactIdIndex([EXACT, EXACT]).size).toBe(1);
  });
});

describe("exactIdFor", () => {
  const index = buildExactIdIndex([EXACT]);
  const set = new Set([EXACT]);

  it("returns the exact id for a stored rounded one", () => {
    expect(exactIdFor(ROUNDED, index, set)).toBe(EXACT);
  });

  it("returns null for an id that is already exact, so it is not rewritten", () => {
    expect(exactIdFor(EXACT, index, set)).toBeNull();
  });

  /*
   * A yacht the vendor has since dropped. Left alone rather than guessed at: the
   * catalogue's ordinary retire sweep owns that decision, not this script.
   */
  it("returns null for an id the vendor no longer publishes", () => {
    expect(exactIdFor("123456", index, set)).toBeNull();
  });
});
