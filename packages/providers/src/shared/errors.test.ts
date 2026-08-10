import { describe, expect, it } from "vitest";

import {
  AuthError,
  ContractError,
  NotFoundError,
  ProviderError,
  RateLimitedError,
  SlotUnavailableError,
  TransientError,
  redactSecrets,
  toSyncErrorType,
} from "./errors";

describe("provider error taxonomy", () => {
  it("assigns each subclass its sync_error_type and retry flag", () => {
    const cases = [
      [new RateLimitedError("slow down"), "rate_limited", true],
      [new TransientError("upstream blip"), "transient", true],
      [new AuthError("bad credentials"), "auth", false],
      [new NotFoundError("no such yacht"), "not_found", false],
      [new ContractError("unparseable"), "contract", false],
      [new SlotUnavailableError("period taken"), "not_found", false],
    ] as const;

    for (const [error, errorType, retryable] of cases) {
      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toBeInstanceOf(Error);
      expect(error.errorType).toBe(errorType);
      expect(error.retryable).toBe(retryable);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("carries the vendor code and endpoint", () => {
    const error = new AuthError("rejected", {
      providerCode: "AUTHENTICATION_ERROR",
      endpoint: "yachtReservation/v6/freeYachts",
    });

    expect(error.sanitizedContext()).toEqual({
      errorType: "auth",
      retryable: false,
      message: "rejected",
      endpoint: "yachtReservation/v6/freeYachts",
      providerCode: "AUTHENTICATION_ERROR",
    });
  });

  it("exposes retryAfterMs on rate limits", () => {
    const error = new RateLimitedError("slow down", { retryAfterMs: 1500 });

    expect(error.retryAfterMs).toBe(1500);
    expect(error.sanitizedContext().retryAfterMs).toBe(1500);
  });

  it("keeps the cause chain", () => {
    const cause = new Error("boom");
    expect(new TransientError("wrapped", { cause }).cause).toBe(cause);
  });
});

describe("redactSecrets", () => {
  it("replaces credential-ish values at any depth without mutating the input", () => {
    const input = {
      credentials: { username: "agency", password: "hunter2" },
      Authorization: "Bearer abc",
      nested: [{ apiToken: "t-1", yachtId: 42 }],
      secret_key: "s",
      yachtName: "Aurora",
    };

    const redacted = redactSecrets(input) as Record<string, unknown>;

    expect(redacted).toEqual({
      credentials: "[redacted]",
      Authorization: "[redacted]",
      nested: [{ apiToken: "[redacted]", yachtId: 42 }],
      secret_key: "[redacted]",
      yachtName: "Aurora",
    });
    expect(input.credentials.password).toBe("hunter2");
  });

  it("survives cycles and passes primitives through", () => {
    const cyclic: Record<string, unknown> = { id: 1 };
    cyclic.self = cyclic;

    expect(redactSecrets(cyclic)).toEqual({ id: 1, self: "[circular]" });
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets("plain")).toBe("plain");
  });

  it("redacts payloads attached to an error", () => {
    const error = new ContractError("bad body", {
      payload: { username: "agency", password: "hunter2", status: "UNKNOWN_ERROR" },
    });

    expect(error.payload).toEqual({
      username: "[redacted]",
      password: "[redacted]",
      status: "UNKNOWN_ERROR",
    });
    expect(JSON.stringify(error.sanitizedContext())).not.toContain("hunter2");
  });
});

describe("toSyncErrorType", () => {
  it("returns the provider error type", () => {
    expect(toSyncErrorType(new RateLimitedError("x"))).toBe("rate_limited");
    expect(toSyncErrorType(new SlotUnavailableError("x"))).toBe("not_found");
  });

  it("classifies network and abort failures as transient", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const refused = new Error("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });

    expect(toSyncErrorType(abort)).toBe("transient");
    expect(toSyncErrorType(refused)).toBe("transient");
  });

  it("never throws on hostile values", () => {
    const hostile = {
      get name(): string {
        throw new Error("nope");
      },
    };

    expect(toSyncErrorType(hostile)).toBe("contract");
    expect(toSyncErrorType(undefined)).toBe("contract");
    expect(toSyncErrorType("plain string")).toBe("contract");
    expect(toSyncErrorType(new TypeError("cannot read properties of undefined"))).toBe("contract");
  });
});
