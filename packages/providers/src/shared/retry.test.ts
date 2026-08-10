import { describe, expect, it } from "vitest";

import {
  AuthError,
  ContractError,
  NotFoundError,
  RateLimitedError,
  TransientError,
} from "./errors";
import { withRetry, type RetryPolicy } from "./retry";

function harness(overrides: Partial<RetryPolicy> = {}) {
  const slept: number[] = [];
  let clock = 0;
  return {
    slept,
    policy: {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      totalDeadlineMs: 60_000,
      random: () => 1,
      now: () => clock,
      sleep: async (ms: number) => {
        slept.push(ms);
        clock += ms;
      },
      ...overrides,
    },
  };
}

describe("withRetry", () => {
  it("attempts an AuthError exactly once", async () => {
    const { policy, slept } = harness();
    let calls = 0;

    await expect(
      withRetry(async () => {
        calls += 1;
        throw new AuthError("rejected", { providerCode: "AUTHENTICATION_ERROR" });
      }, policy),
    ).rejects.toBeInstanceOf(AuthError);

    expect(calls).toBe(1);
    expect(slept).toEqual([]);
  });

  it("fails fast on contract and not-found errors", async () => {
    for (const error of [new ContractError("bad body"), new NotFoundError("gone")]) {
      const { policy } = harness();
      let calls = 0;

      await expect(
        withRetry(async () => {
          calls += 1;
          throw error;
        }, policy),
      ).rejects.toBe(error);

      expect(calls).toBe(1);
    }
  });

  it("does not retry unclassified errors", async () => {
    const { policy } = harness();
    let calls = 0;

    await expect(
      withRetry(async () => {
        calls += 1;
        throw new Error("raw");
      }, policy),
    ).rejects.toThrow("raw");

    expect(calls).toBe(1);
  });

  it("retries a TransientError up to maxAttempts then rethrows", async () => {
    const { policy, slept } = harness();
    let calls = 0;

    await expect(
      withRetry(async () => {
        calls += 1;
        throw new TransientError("upstream blip");
      }, policy),
    ).rejects.toBeInstanceOf(TransientError);

    expect(calls).toBe(4);
    // random() === 1 makes full jitter degenerate to the capped ceiling.
    expect(slept).toEqual([100, 200, 400]);
  });

  it("returns the value when a later attempt succeeds", async () => {
    const { policy, slept } = harness();
    let calls = 0;

    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TransientError("first");
      }
      return "ok";
    }, policy);

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(slept).toEqual([100]);
  });

  it("keeps full-jitter delays inside [0, cap]", async () => {
    const { policy, slept } = harness({ random: () => 0.5, maxAttempts: 5, maxDelayMs: 250 });

    await expect(
      withRetry(() => Promise.reject(new TransientError("blip")), policy),
    ).rejects.toBeInstanceOf(TransientError);

    expect(slept).toEqual([50, 100, 125, 125]);
  });

  it("honours RateLimitedError.retryAfterMs over the computed backoff", async () => {
    const { policy, slept } = harness();
    let calls = 0;

    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new RateLimitedError("slow down", { retryAfterMs: 7500 });
      }
      return "ok";
    }, policy);

    expect(result).toBe("ok");
    expect(slept).toEqual([7500]);
  });

  it("respects the total deadline instead of sleeping past it", async () => {
    const { policy, slept } = harness({ totalDeadlineMs: 250 });
    let calls = 0;

    await expect(
      withRetry(async () => {
        calls += 1;
        throw new TransientError("blip");
      }, policy),
    ).rejects.toBeInstanceOf(TransientError);

    // 100 fits inside the 250ms budget, the next 200 would overrun it.
    expect(slept).toEqual([100]);
    expect(calls).toBe(2);
  });
});
