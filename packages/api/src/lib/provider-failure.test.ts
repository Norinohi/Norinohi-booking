import { describe, expect, it } from "vitest";

import {
  AuthError,
  ContractError,
  NotFoundError,
  RateLimitedError,
  SlotUnavailableError,
  TransientError,
} from "@yacht-charter/providers/shared/errors";

import { describeProviderFailure, saysSlotIsGone } from "./provider-failure";

describe("describeProviderFailure", () => {
  it("keeps the vendor text out of what the customer reads", () => {
    const failure = describeProviderFailure(
      new AuthError(
        "NauSYS /CBMS-external/rest/booking/v6/createOption failed with OPERATION_NOT_ALLOWED",
        {
          providerCode: "OPERATION_NOT_ALLOWED",
        },
      ),
      "Provider rejected the option",
    );

    expect(failure.customer).not.toContain("NauSYS");
    expect(failure.customer).not.toContain("OPERATION_NOT_ALLOWED");
    expect(failure.detail).toContain("OPERATION_NOT_ALLOWED");
  });

  it("tells the customer to pick new dates when the slot is gone", () => {
    for (const error of [new SlotUnavailableError("gone"), new NotFoundError("gone")]) {
      expect(describeProviderFailure(error, "fallback").customer).toMatch(/no longer available/i);
    }
  });

  it("invites a retry only for the failures a retry can fix", () => {
    for (const error of [new TransientError("boom"), new RateLimitedError("slow down")]) {
      expect(describeProviderFailure(error, "fallback").customer).toMatch(/try again/i);
    }
    expect(describeProviderFailure(new ContractError("bad payload"), "fallback").customer).toMatch(
      /contact us/i,
    );
  });

  it("falls back when the thrown value was not an error at all", () => {
    expect(describeProviderFailure(null, "Provider rejected the option")).toEqual({
      customer: expect.stringMatching(/contact us/i),
      detail: "Provider rejected the option",
    });
  });
});

describe("saysSlotIsGone", () => {
  /* This is what decides whether a week is written off as sold, so it has to be narrower than
     "the vendor said no": a boat that is merely unreachable must stay on sale. */
  it("is true only where the vendor said the charter itself is gone", () => {
    expect(saysSlotIsGone(new SlotUnavailableError("gone"))).toBe(true);
    expect(saysSlotIsGone(new NotFoundError("gone"))).toBe(true);
  });

  it("is false for a vendor that failed to answer, and for a thrown non-error", () => {
    for (const error of [
      new TransientError("boom"),
      new RateLimitedError("slow down"),
      new AuthError("no access", { providerCode: "OPERATION_NOT_ALLOWED" }),
      new ContractError("bad payload"),
    ]) {
      expect(saysSlotIsGone(error)).toBe(false);
    }
    expect(saysSlotIsGone(null)).toBe(false);
  });
});
