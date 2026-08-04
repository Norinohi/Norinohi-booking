import { describe, expect, it } from "vitest";

import { catalogue } from "../mock/data";
import { mapSlotToOffer, mapYachtToListing } from "./mock";

describe("mock mapping", () => {
  it("maps a provider yacht into a canonical listing", () => {
    const yacht = catalogue.yachts[0];
    if (!yacht) {
      throw new Error("Expected first yacht fixture");
    }

    const listing = mapYachtToListing(yacht);

    expect(listing.id).toBe("ylst_yacht-lagoon-42-aurora");
    expect(listing.category).toBe("Catamaran");
    expect(listing.base.country).toBe("Croatia");
    expect(listing.providerSourceId).toBe("mock:yacht-lagoon-42-aurora");
  });

  it("maps availability slots into deterministic offers", () => {
    const offer = mapSlotToOffer(
      {
        yachtId: "yacht-lagoon-42-aurora",
        startDate: "2026-08-08",
        endDate: "2026-08-15",
        status: "available",
        priceMinor: 540000,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
      },
      6,
    );

    expect(offer.nights).toBe(7);
    expect(offer.clientPrice.amountMinor).toBe(540000);
    expect(offer.obligatoryExtras).toHaveLength(1);
  });
});
