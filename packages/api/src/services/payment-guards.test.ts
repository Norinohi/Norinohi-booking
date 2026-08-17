import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { assertHoldStillValid, assertIntentIsResumable, assertPayable } from "./payment-guards";

/*
 * The two guards `checkout.confirm` runs before it will open or resume a charge.
 * Both exist because of real failures: handing a client secret back for an intent
 * that already succeeded invites a second charge, and refusing a legal retry with
 * an unmapped transition error surfaced to customers as a 500.
 */

/** Each guard names its refusal in `data.code`; anything else falls back to the ORPC code. */
const failureDataSchema = z.object({ code: z.string() });

function codeOf(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error;
    return failureDataSchema.safeParse(error.data).data?.code ?? error.code;
  }
}

describe("assertIntentIsResumable", () => {
  it("resumes an intent the customer has not paid yet", () => {
    expect(codeOf(() => assertIntentIsResumable("requires_payment_method"))).toBeUndefined();
    expect(codeOf(() => assertIntentIsResumable("requires_confirmation"))).toBeUndefined();
    // Mid-3DS: the customer can come back and finish the same intent.
    expect(codeOf(() => assertIntentIsResumable("requires_action"))).toBeUndefined();
  });

  it("refuses to re-present money that is already taken or in flight", () => {
    expect(codeOf(() => assertIntentIsResumable("succeeded"))).toBe("ALREADY_PAID");
    expect(codeOf(() => assertIntentIsResumable("processing"))).toBe("ALREADY_PAID");
  });

  it("sends a cancelled intent back to repricing rather than a silent retry", () => {
    // A fresh create would reuse the same Idempotency-Key and return this very intent.
    expect(codeOf(() => assertIntentIsResumable("canceled"))).toBe("QUOTE_EXPIRED");
  });
});

describe("assertPayable", () => {
  it("allows the states a payment can legally start from", () => {
    expect(codeOf(() => assertPayable("OPTION_HELD"))).toBeUndefined();
    expect(codeOf(() => assertPayable("QUOTED"))).toBeUndefined();
    // A declined card leaves the booking here, and trying another one is the point.
    expect(codeOf(() => assertPayable("PAYMENT_FAILED"))).toBeUndefined();
  });

  it("refuses a booking that is past paying, as a conflict rather than a 500", () => {
    expect(codeOf(() => assertPayable("CONFIRMED"))).toBe("NOT_PAYABLE");
    expect(codeOf(() => assertPayable("CANCELLED"))).toBe("NOT_PAYABLE");
    expect(codeOf(() => assertPayable("REFUNDED"))).toBe("NOT_PAYABLE");
  });

  /*
   * The ordering bug this whole pair exists for: PAYMENT_PENDING is not a legal move
   * to itself, so a retry must be answered by the reuse path above rather than by
   * this guard. If confirmCheckout ever calls it first again, this is the reminder.
   */
  it("treats PAYMENT_PENDING as not-payable, which is why reuse runs first", () => {
    expect(codeOf(() => assertPayable("PAYMENT_PENDING"))).toBe("NOT_PAYABLE");
  });
});

describe("assertHoldStillValid", () => {
  const now = new Date("2026-08-14T12:00:00Z");

  it("lets a live hold through", () => {
    expect(
      codeOf(() => assertHoldStillValid(new Date("2026-08-14T12:30:00Z"), now)),
    ).toBeUndefined();
  });

  it("ignores providers that grant no hold at all", () => {
    // No option support means there is nothing to lapse, not a lapsed hold.
    expect(codeOf(() => assertHoldStillValid(null, now))).toBeUndefined();
  });

  it("refuses to charge for a slot the provider has released", () => {
    // The sweeper leaves PAYMENT_PENDING alone, so nothing else catches this before
    // the customer is charged for a booking the provider will then refuse.
    expect(codeOf(() => assertHoldStillValid(new Date("2026-08-14T11:59:59Z"), now))).toBe(
      "QUOTE_EXPIRED",
    );
  });

  it("treats the exact expiry instant as lapsed", () => {
    expect(codeOf(() => assertHoldStillValid(now, now))).toBe("QUOTE_EXPIRED");
  });
});
