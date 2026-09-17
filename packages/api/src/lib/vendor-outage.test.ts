import { describe, expect, it } from "vitest";

import { onlyVendorFailures } from "./vendor-outage";

describe("onlyVendorFailures", () => {
  it("is an outage when every vendor asked errored or timed out", () => {
    expect(onlyVendorFailures([{ outcome: "error" }])).toBe(true);
    expect(onlyVendorFailures([{ outcome: "timeout" }, { outcome: "ineligible" }])).toBe(true);
  });

  it("is a refusal once any vendor said the dates are taken", () => {
    expect(onlyVendorFailures([{ outcome: "error" }, { outcome: "unavailable" }])).toBe(false);
    expect(onlyVendorFailures([{ outcome: "unavailable" }])).toBe(false);
  });

  it("is not an outage when nobody was asked", () => {
    expect(onlyVendorFailures([])).toBe(false);
    expect(onlyVendorFailures([{ outcome: "ineligible" }])).toBe(false);
  });
});
