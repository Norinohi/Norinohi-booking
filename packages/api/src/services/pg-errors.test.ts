import { describe, expect, it } from "vitest";

import { isUniqueViolation, violatedConstraint } from "./pg-errors";

/** What `pg` throws, cut down to the fields these functions read. */
type DriverError = { code: string; constraint?: string; cause?: DriverError };

/*
 * Drizzle wraps the driver's error in a DrizzleQueryError, so everything here is nested one
 * level down: reading only the top of the chain is the failure both functions exist to avoid.
 */
function wrapped(driverError: DriverError): Error {
  return new Error("Failed query: insert into booking ...", { cause: driverError });
}

function uniqueViolation(constraint: string) {
  return { code: "23505", constraint } satisfies DriverError;
}

describe("violatedConstraint", () => {
  it("names the constraint through Drizzle's wrapper", () => {
    expect(violatedConstraint(wrapped(uniqueViolation("booking_user_idempotency_uq")))).toBe(
      "booking_user_idempotency_uq",
    );
  });

  it("separates the two collisions insertBooking has to tell apart", () => {
    // The reference collision is retried with a fresh code; the idempotency one never can be,
    // because the retry does not change the key.
    expect(violatedConstraint(wrapped(uniqueViolation("booking_reference_unique")))).not.toBe(
      "booking_user_idempotency_uq",
    );
  });

  it("answers undefined where the driver named none", () => {
    expect(violatedConstraint(wrapped({ code: "23505" }))).toBeUndefined();
    expect(violatedConstraint(new Error("connection reset"))).toBeUndefined();
    expect(violatedConstraint(null)).toBeUndefined();
  });

  it("gives up rather than following a cycle", () => {
    const looping: DriverError = { code: "23505" };
    looping.cause = looping;

    expect(violatedConstraint(looping)).toBeUndefined();
  });
});

describe("isUniqueViolation", () => {
  it("sees the SQLSTATE through the wrapper", () => {
    expect(isUniqueViolation(wrapped(uniqueViolation("booking_reference_unique")))).toBe(true);
  });

  it("does not claim other failures", () => {
    expect(isUniqueViolation(wrapped({ code: "23503" }))).toBe(false);
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
  });
});
