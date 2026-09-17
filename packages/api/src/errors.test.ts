import { call, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "./context";
import {
  ConflictError,
  DomainError,
  type DomainErrorKind,
  type DomainErrorOptions,
  ForbiddenError,
  InternalError,
  NotFoundError,
} from "./errors";
import { protectedProcedure, publicProcedure } from "./index";
import { domainErrorToORPCError } from "./orpc-errors";

/*
 * The web app reads `code`, `status`, `message` and `data.code` off a refusal, so moving the
 * services off `ORPCError` is only safe while the translated error serializes exactly as the
 * one they used to throw. `toJSON` is what both handlers put on the wire.
 */

// SAFETY: a stub with nothing behind it. The procedures below never read db or provider, so
// any access is a TypeError rather than a quietly wrong answer.
const anonymous = Object.assign({} as Context, { auth: null, session: null });

type Session = NonNullable<Context["session"]>;

// SAFETY: as above; `requireAuth` only checks that a user is present.
const signedIn = Object.assign({} as Context, {
  auth: null,
  session: Object.assign({} as Session, {
    user: Object.assign({} as Session["user"], { id: "user_test" }),
  }),
});

function wireOf(error: ORPCError<string, unknown>) {
  return error.toJSON();
}

async function rejectionOf(run: () => Promise<string>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to reject with an Error");
}

describe("domainErrorToORPCError", () => {
  const cases: Array<[DomainErrorKind, DomainErrorOptions]> = [
    ["NOT_FOUND", { message: "Unknown quote" }],
    ["CONFLICT", { message: "Requested slot is not available" }],
    [
      "CONFLICT",
      {
        message: "Quote has expired, reprice before continuing",
        data: { code: "QUOTE_EXPIRED", quoteId: "qte_1" },
      },
    ],
    [
      "BAD_REQUEST",
      {
        message: "This listing does not offer: sup",
        data: { code: "EXTRA_NOT_REQUESTABLE", extras: ["sup"] },
      },
    ],
    ["FORBIDDEN", { message: "Quote belongs to another user" }],
    ["UNAUTHORIZED", {}],
    ["PRECONDITION_FAILED", { message: "Not ready" }],
    ["INTERNAL_SERVER_ERROR", {}],
    ["NOT_IMPLEMENTED", { message: "Stripe is not configured" }],
    ["BAD_GATEWAY", { message: "Stripe refused" }],
    ["SERVICE_UNAVAILABLE", { message: "No provider" }],
  ];

  it.each(cases)("serializes %s exactly as the ORPCError it replaces", (kind, options) => {
    const translated = domainErrorToORPCError(new DomainError(kind, options));
    const original = new ORPCError(kind, { message: options.message, data: options.data });

    expect(wireOf(translated)).toEqual(wireOf(original));
  });

  it("falls back to the transport's wording when the service gave no message", () => {
    expect(wireOf(domainErrorToORPCError(new InternalError()))).toEqual({
      defined: false,
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "Internal Server Error",
      data: undefined,
    });
  });

  it("keeps the domain error as the cause for logs", () => {
    const refusal = new NotFoundError({ message: "Unknown booking" });
    expect(domainErrorToORPCError(refusal).cause).toBe(refusal);
  });

  it("gives each subclass the kind its name promises", () => {
    expect(new ConflictError().kind).toBe("CONFLICT");
    expect(new ForbiddenError().kind).toBe("FORBIDDEN");
    expect(new NotFoundError().kind).toBe("NOT_FOUND");
  });
});

describe("the procedure builders", () => {
  it("translate a refusal thrown by a public handler", async () => {
    const procedure = publicProcedure.handler((): string => {
      throw new ConflictError({
        message: "Quote has already been used",
        data: { code: "QUOTE_EXPIRED" },
      });
    });

    const error = await rejectionOf(() => call(procedure, undefined, { context: anonymous }));

    expect(error).toBeInstanceOf(ORPCError);
    expect(error instanceof ORPCError && wireOf(error)).toEqual({
      defined: false,
      code: "CONFLICT",
      status: 409,
      message: "Quote has already been used",
      data: { code: "QUOTE_EXPIRED" },
    });
  });

  it("translate a refusal thrown by a protected handler", async () => {
    const procedure = protectedProcedure.handler((): string => {
      throw new NotFoundError({ message: "Unknown booking" });
    });

    const error = await rejectionOf(() => call(procedure, undefined, { context: signedIn }));

    expect(error instanceof ORPCError && [error.code, error.status, error.message]).toEqual([
      "NOT_FOUND",
      404,
      "Unknown booking",
    ]);
  });

  it("leave an ORPCError, and anything else, exactly as thrown", async () => {
    const direct = new ORPCError("CONFLICT", { message: "Thrown by a router" });
    const bug = new TypeError("not a refusal");

    const directProcedure = publicProcedure.handler((): string => {
      throw direct;
    });
    const buggyProcedure = publicProcedure.handler((): string => {
      throw bug;
    });

    await expect(call(directProcedure, undefined, { context: anonymous })).rejects.toBe(direct);
    await expect(call(buggyProcedure, undefined, { context: anonymous })).rejects.toBe(bug);
  });

  it("still refuse an anonymous caller before the handler runs", async () => {
    const procedure = protectedProcedure.handler((): string => {
      throw new ForbiddenError();
    });

    const error = await rejectionOf(() => call(procedure, undefined, { context: anonymous }));

    expect(error instanceof ORPCError && error.code).toBe("UNAUTHORIZED");
  });
});
