import { describe, expect, it } from "vitest";

import { UNAMBIGUOUS_ALPHABET, randomCode, withUniqueRetry } from "./random-code";

describe("randomCode", () => {
  it("returns exactly the requested length", () => {
    for (const length of [1, 8, 32]) expect(randomCode(length)).toHaveLength(length);
  });

  it("returns an empty string for length zero", () => {
    expect(randomCode(0)).toBe("");
  });

  it("only ever emits alphabet characters", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(randomCode(8)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("omits the glyphs that are misread aloud", () => {
    // Booking references and referral codes get read out and retyped. L is kept:
    // only the digit/letter collisions are dropped, giving 24 letters + 8 digits.
    for (const excluded of ["I", "O", "0", "1"]) {
      expect(UNAMBIGUOUS_ALPHABET).not.toContain(excluded);
    }
    expect(UNAMBIGUOUS_ALPHABET).toHaveLength(32);
  });

  it("accepts a caller-supplied alphabet", () => {
    expect(randomCode(6, "A")).toBe("AAAAAA");
  });

  it("does not return the same code twice in a row", () => {
    const codes = new Set(Array.from({ length: 50 }, () => randomCode(8)));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("withUniqueRetry", () => {
  const uniqueViolation = () => Object.assign(new Error("duplicate key"), { code: "23505" });

  it("returns the first successful row without retrying", async () => {
    let calls = 0;
    const result = await withUniqueRetry(5, async () => {
      calls += 1;
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on a unique violation and returns the row that lands", async () => {
    let calls = 0;
    const result = await withUniqueRetry(5, async () => {
      calls += 1;
      if (calls < 3) throw uniqueViolation();
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("retries when the insert returns nothing", async () => {
    let calls = 0;
    await withUniqueRetry(3, async () => {
      calls += 1;
      return undefined;
    });

    expect(calls).toBe(3);
  });

  it("gives up with undefined so each caller keeps its own error message", async () => {
    const result = await withUniqueRetry(2, async () => {
      throw uniqueViolation();
    });

    expect(result).toBeUndefined();
  });

  it("rethrows anything that is not a unique violation", async () => {
    let calls = 0;
    await expect(
      withUniqueRetry(5, async () => {
        calls += 1;
        throw new Error("connection lost");
      }),
    ).rejects.toThrow("connection lost");

    expect(calls).toBe(1);
  });

  it("makes no attempts when given none", async () => {
    let calls = 0;
    const result = await withUniqueRetry(0, async () => {
      calls += 1;
      return "ok";
    });

    expect(result).toBeUndefined();
    expect(calls).toBe(0);
  });
});
