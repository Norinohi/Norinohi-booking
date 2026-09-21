import { describe, expect, it } from "vitest";

import type { ProviderInvoice } from "@yacht-charter/providers";

import { commissionMismatchOf } from "./invoice-commission";

/* The test company's own agency invoice, Sep 2026. */
const INVOICE: ProviderInvoice = {
  number: "1/2026",
  issuedOn: "2026-07-18",
  providerReservationId: "918404153",
  currency: "EUR",
  totalMinor: 12_694,
  netMinor: 10_155,
  lines: [{ code: "AG-COMM-1", label: "Agencijska provizija", netMinor: 10_155, vatRate: 25 }],
};

const held = (commissionMinor: number | null, currency: string | null = "EUR") => ({
  id: "bkg_1",
  reference: "NB-1",
  commissionMinor,
  currency,
});

describe("commissionMismatchOf", () => {
  it("says nothing when the invoice charges the commission the quote was won on", () => {
    expect(commissionMismatchOf(INVOICE, held(10_155))).toBeNull();
  });

  it("reports the two figures when they differ", () => {
    expect(commissionMismatchOf(INVOICE, held(12_000))).toEqual({
      reference: "NB-1",
      invoiced: 10_155,
      quoted: 12_000,
      currency: "EUR",
    });
  });

  it("compares nothing across currencies, or against a commission nobody stated", () => {
    expect(commissionMismatchOf(INVOICE, held(12_000, "USD"))).toBeNull();
    expect(commissionMismatchOf(INVOICE, held(null))).toBeNull();
  });

  it("reads only the commission lines of an invoice", () => {
    const withFee = {
      ...INVOICE,
      lines: [...INVOICE.lines, { code: "OTHER", label: "Fee", netMinor: 500 }],
    };
    expect(commissionMismatchOf(withFee, held(10_155))).toBeNull();
  });
});
