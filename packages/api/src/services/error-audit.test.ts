import { ORPCError } from "@orpc/server";
import { AuthError, TransientError } from "@yacht-charter/providers/shared/errors";
import { parseError } from "evlog";
import { describe, expect, it } from "vitest";

import { ConflictError, InternalError } from "../errors";
import { domainErrorToORPCError } from "../orpc-errors";
import { describeThrown, redactErrorContext, scrubMessage } from "./error-audit";

describe("redactErrorContext", () => {
  it("replaces credentials, tokens, card fields and API keys at any depth", () => {
    const context = {
      input: {
        bookingId: "bk_1",
        password: "hunter2",
        nested: { accessToken: "tok", apiKey: "sk_live", api_key: "k", Authorization: "Bearer x" },
        payment: { cardNumber: "4242424242424242", cvc: "123", iban: "DE89" },
        items: [{ clientSecret: "pi_secret" }],
      },
    };

    expect(redactErrorContext({ context })).toEqual({
      input: {
        bookingId: "bk_1",
        password: "[redacted]",
        nested: {
          accessToken: "[redacted]",
          apiKey: "[redacted]",
          api_key: "[redacted]",
          Authorization: "[redacted]",
        },
        payment: { cardNumber: "[redacted]", cvc: "[redacted]", iban: "[redacted]" },
        items: [{ clientSecret: "[redacted]" }],
      },
    });
  });

  it("stores nothing for no context and a preview for an oversized one", () => {
    expect(redactErrorContext({})).toBeNull();
    expect(redactErrorContext({ context: null })).toBeNull();

    const big = redactErrorContext({ context: { blob: "x".repeat(10_000) } });
    expect(big).toMatchObject({ truncated: true });
    expect(JSON.stringify(big).length).toBeLessThan(4_200);
  });

  it("marks a value JSON cannot hold instead of throwing", () => {
    expect(redactErrorContext({ context: { count: 10n } })).toBe("[unserializable]");
  });
});

describe("scrubMessage", () => {
  it("drops the bound parameters Drizzle appends to a failed query", () => {
    expect(
      scrubMessage('Failed query: insert into "user" values ($1)\nparams: guest@example.com'),
    ).toBe('Failed query: insert into "user" values ($1)');
  });

  it("caps a long message", () => {
    expect(scrubMessage("y".repeat(900))).toHaveLength(503);
  });
});

describe("describeThrown", () => {
  it("reads kind, status and domain code off a refusal before and after translation", () => {
    const refusal = new ConflictError({ message: "Slot taken", data: { code: "SLOT_TAKEN" } });

    const expected = {
      kind: "CONFLICT",
      status: 409,
      code: "SLOT_TAKEN",
      message: "Slot taken",
    };
    expect(describeThrown(parseError(refusal))).toMatchObject(expected);
    expect(describeThrown(parseError(domainErrorToORPCError(refusal)))).toMatchObject({
      ...expected,
      errorName: "DomainError",
    });
  });

  it("treats an unexpected error as a 500 and lists its causes", () => {
    const error = new Error("outer", { cause: new TypeError("inner") });

    expect(describeThrown(parseError(error))).toEqual({
      errorName: "Error",
      kind: null,
      code: null,
      status: 500,
      message: "outer",
      causes: ["TypeError: inner"],
    });
    expect(describeThrown(parseError(new InternalError()))).toMatchObject({ status: 500 });
    expect(describeThrown(parseError(new ORPCError("BAD_GATEWAY")))).toMatchObject({
      status: 502,
    });
  });

  it("keeps a vendor's classification and code but never its payload", () => {
    const vendor = new AuthError("NauSYS refused the credentials", {
      providerCode: "AUTHENTICATION_ERROR",
      endpoint: "/booking/v6/createOption",
      payload: { username: "u", password: "p", body: "huge" },
    });

    const description = describeThrown(parseError(vendor));
    expect(description).toMatchObject({
      errorName: "AuthError",
      code: "AUTHENTICATION_ERROR",
      provider: {
        errorType: "auth",
        providerCode: "AUTHENTICATION_ERROR",
        endpoint: "/booking/v6/createOption",
        retryable: false,
      },
    });
    expect(JSON.stringify(description)).not.toContain("huge");
    expect(describeThrown(parseError(new TransientError("timed out"))).code).toBe("transient");
  });

  it("describes a thrown non-error by its text", () => {
    expect(describeThrown(parseError("boom"))).toMatchObject({
      errorName: "NonError",
      status: 500,
      message: "boom",
    });
  });
});
