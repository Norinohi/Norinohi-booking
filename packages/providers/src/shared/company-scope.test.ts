import { describe, expect, it } from "vitest";

import { companyScopeFromEnv, createCompanyScope, parseCompanyIds } from "./company-scope";

describe("parseCompanyIds", () => {
  it("reads a comma separated list, trimming and dropping blanks", () => {
    expect(parseCompanyIds(" 225 , 1234,,  ")).toEqual(["225", "1234"]);
  });

  it("treats an unset or empty variable as no list at all", () => {
    expect(parseCompanyIds(undefined)).toEqual([]);
    expect(parseCompanyIds("   ")).toEqual([]);
  });
});

describe("createCompanyScope", () => {
  it("admits everything when neither list is configured", () => {
    const scope = createCompanyScope([], []);

    expect(scope.inScope("225")).toBe(true);
    expect(scope.inScope("anything")).toBe(true);
  });

  it("admits only the allowlist when one is configured", () => {
    const scope = createCompanyScope(["225"], []);

    expect(scope.inScope("225")).toBe(true);
    expect(scope.inScope("1234")).toBe(false);
  });

  it("admits everything but the exclusions when only they are configured", () => {
    const scope = createCompanyScope([], ["225"]);

    expect(scope.inScope("225")).toBe(false);
    expect(scope.inScope("1234")).toBe(true);
  });

  it("lets exclusion win over inclusion", () => {
    // A contradiction, and the safe reading of a contradiction about test data is
    // to keep it out. Production sets only the exclusion list, so the case arises
    // from an editing mistake rather than a deliberate configuration.
    const scope = createCompanyScope(["225", "1234"], ["225"]);

    expect(scope.inScope("225")).toBe(false);
    expect(scope.inScope("1234")).toBe(true);
  });

  it("compares ids as strings, matching provider_record.external_id", () => {
    const scope = createCompanyScope([], ["225"]);

    expect(scope.inScope("225")).toBe(false);
    // Not the same id: the vendor's numeric form is normalised before it gets here.
    expect(scope.inScope("0225")).toBe(true);
  });
});

describe("companyScopeFromEnv", () => {
  it("keeps the allowlist verbatim for callers that narrow a vendor query", () => {
    const scope = companyScopeFromEnv("225, 1234", "1234");

    expect(scope.include).toEqual(["225", "1234"]);
    expect(scope.exclude).toEqual(["1234"]);
    expect(scope.inScope("1234")).toBe(false);
  });
});
