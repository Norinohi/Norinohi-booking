import { describe, expect, it } from "vitest";

import { classifyNausysResponse } from "./client";
import { nausysEndpoints } from "./endpoints";

/* The shape the test company's agency export answered with (Sep 2026): no `status` at all. */
const EXPORT = {
  invoices: [],
  summary: { apiCount: 0, fiCount: 1, sapiCount: 0, sfiCount: 0, totalCount: 1 },
};

describe("the agency invoice export", () => {
  it("is read without a status, which it never carries when it succeeds", () => {
    expect(
      classifyNausysResponse(200, EXPORT, { endpoint: nausysEndpoints.sales.agencyInvoices }),
    ).toBeNull();
  });

  it("still fails on the refusal it does carry a status for", () => {
    expect(
      classifyNausysResponse(
        200,
        { status: "AUTHENTICATION_ERROR" },
        { endpoint: nausysEndpoints.sales.agencyInvoices },
      )?.providerCode,
    ).toBe("AUTHENTICATION_ERROR");
  });

  it("gives no other endpoint the same leave", () => {
    expect(
      classifyNausysResponse(200, EXPORT, { endpoint: nausysEndpoints.availability.freeYachts }),
    ).not.toBeNull();
  });
});
