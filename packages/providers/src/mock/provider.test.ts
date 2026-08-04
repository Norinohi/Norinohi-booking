import { describe, expect, it } from "vitest";

import { MockInventoryProvider } from "./provider";

describe("MockInventoryProvider", () => {
  it("returns a repriced quote when optional extras are selected", async () => {
    const provider = new MockInventoryProvider();
    const quote = await provider.getQuote({
      listingId: "ylst_yacht-lagoon-42-aurora",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      guests: 8,
      extras: ["skipper"],
      currency: "EUR",
    });

    expect(quote.repriced).toBe(true);
    expect(quote.total.amountMinor).toBe(706500);
    expect(quote.deposit.amountMinor).toBe(353250);
  });
});
