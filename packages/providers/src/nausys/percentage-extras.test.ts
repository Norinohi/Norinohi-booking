import { describe, expect, it } from "vitest";

import { restFreeYachtsResponseSchema } from "./endpoints";
import { extraLineMinor } from "./extras";
import { mapFreeYachtToProviderQuote } from "./quote";

/*
 * Yacht 75193633 as production sent it on 1 September 2026, trimmed to the parts that matter.
 * Its one obligatory extra is a 35% service charge: `amount` is the rate to four decimals, a
 * format the vendor documented when it widened the field in May 2022, and reading it as money
 * makes a 7,910.00 fee into 35 cents.
 */
const yacht = restFreeYachtsResponseSchema.parse({
  status: "OK",
  freeYachts: [
    {
      yachtId: 75193633,
      periodFrom: "03.10.2026",
      periodTo: "10.10.2026",
      status: "FREE",
      price: {
        priceListPrice: "22600.00",
        clientPrice: "22600.00",
        currency: "EUR",
        depositAmount: "0.00",
        discounts: [],
      },
      obligatoryExtras: [
        {
          serviceId: 109219,
          amount: "0.3500",
          totalPrice: "7910.00",
          quantity: "1.00",
          currency: "EUR",
          calculationType: "SEPARATE_PAYMENT",
          amountIsPercentage: true,
          percentageCalculationType: "PRICELIST_PRICE",
        },
      ],
    },
  ],
}).freeYachts![0]!;

/** The same extra as the vendor sends it on a catalogue row, where there is no line total. */
function withoutTotal() {
  const { totalPrice: _total, ...rest } = yacht.obligatoryExtras![0]!;
  return rest;
}

describe("yacht 75193633, a mandatory 35% service charge", () => {
  it("prices it from the vendor's own total when there is one", () => {
    const quote = mapFreeYachtToProviderQuote({
      yacht,
      listingId: "l",
      checkIn: "2026-10-03",
      checkOut: "2026-10-10",
      guests: 2,
      crewType: "bareboat",
      extras: [],
      crewServiceIds: [],
      securityDeposit: undefined,
      expiresAt: new Date(0).toISOString(),
    });
    expect(quote.total.amountMinor).toBe(3_051_000); // 22,600.00 + 7,910.00
  });

  it("computes it from the rate when the vendor sends no total", () => {
    const line = extraLineMinor(withoutTotal(), "EUR", {
      listMinor: 2_260_000,
      clientMinor: 2_260_000,
    });

    expect(line).toBe(791_000); // 35% of 22,600.00, not the 35 cents "0.3500" reads as
  });

  it("charges nothing rather than guessing when it cannot value the basis", () => {
    expect(extraLineMinor(withoutTotal(), "EUR")).toBe(0);
  });
});
