import { describe, expect, it } from "vitest";

import { ownLineLabel } from "./own-line-label";

describe("ownLineLabel", () => {
  it("recognises the adapters' placeholders whatever the line code", () => {
    expect(ownLineLabel({ code: "base-charter", label: "Charter price" })).toBe("charterPrice");
    expect(ownLineLabel({ code: "nausys-service-52", label: "Charter extra" })).toBe(
      "charterExtra",
    );
    expect(ownLineLabel({ code: "nausys-discount-119083", label: "Charter discount" })).toBe(
      "charterDiscount",
    );
    expect(ownLineLabel({ code: "bm-discount", label: " Charter discount " })).toBe(
      "charterDiscount",
    );
  });

  it("recognises the referral lines by code", () => {
    expect(ownLineLabel({ code: "referral-welcome", label: "Referral welcome discount" })).toBe(
      "referralWelcome",
    );
    expect(ownLineLabel({ code: "referral-credit", label: "Referral credit" })).toBe(
      "referralCredit",
    );
  });

  it("leaves a vendor's or an operator's own name alone", () => {
    expect(ownLineLabel({ code: "service:3", label: "Transit log" })).toBeNull();
    expect(ownLineLabel({ code: "SIDEBAR10", label: "Sidebar test 10%" })).toBeNull();
    expect(ownLineLabel({ code: "service:100518", label: "Charter package" })).toBeNull();
  });
});
