import { describe, expect, it } from "vitest";

import {
  AuthError,
  ContractError,
  NotFoundError,
  RateLimitedError,
  SlotUnavailableError,
  TransientError,
} from "@yacht-charter/providers/shared/errors";

import { describeProviderFailure } from "./provider-failure";

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
