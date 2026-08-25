import type { ListingSearchDoc } from "@yacht-charter/db/search";

import { describe, expect, it } from "vitest";

import { presentListingSummary } from "./listing";

const doc = (over: Partial<ListingSearchDoc> = {}): ListingSearchDoc => ({
  listingId: "ylst_1",
  slug: "liburna-sunseeker",
  title: "Liburna Sunseeker",
  category: "Motor yacht",
  crewType: "full_crew",
  builder: "Sunseeker",
  model: "Predator 60",
  modelCanonical: "Predator 60",
  operator: "Alimos Charter",
  operatorTermsAndConditions: null,
  baseId: "base_1",
  baseName: "Alimos Marina",
  city: "Athens",
  location: "Alimos",
  region: "Attica",
  country: "Greece",
  lat: null,
  lng: null,
  baseEmail: null,
  basePhone: null,
  baseWebsite: null,
  baseCheckInTime: "17:00",
  baseCheckOutTime: "09:00",
  lengthM: "15.50",
  cabins: 3,
  berths: 6,
  heads: 2,
  showers: 3,
  yearBuilt: 2023,
  sailType: null,
  securityDepositMinor: 310_000,
  securityDepositCurrency: "EUR",
  depositInsuranceIncluded: true,
  petsAllowed: false,
  rating: "5.00",
  reviewCount: 4,
  bookedThisMonth: 0,
  viewedToday: 2,
  mainImage: null,
  gallery: [],
  amenities: [],
  priceFromMinor: 1_240_000,
  currency: "EUR",
  availableFrom: "2026-06-13",
  availableTo: "2026-08-29",
  bookableFrom: null,
  bookableTo: null,
  hasUnconfirmedAvailability: false,
  hasTemporaryBooking: false,
  ...over,
});

describe("presentListingSummary", () => {
  it("quotes the provider's own deposit rather than a share of the price", () => {
    expect(presentListingSummary(doc()).priceDetails.securityDeposit).toEqual({
      amountMinor: 310_000,
      currency: "EUR",
    });
  });

  it("keeps the deposit in the currency it was taken in", () => {
    const summary = presentListingSummary(doc({ securityDepositCurrency: "HRK" }));

    expect(summary.priceFrom?.currency).toBe("EUR");
    expect(summary.priceDetails.securityDeposit?.currency).toBe("HRK");
  });

  it("falls back to the listing currency for a deposit that names none", () => {
    expect(
      presentListingSummary(doc({ securityDepositCurrency: null })).priceDetails.securityDeposit,
    ).toEqual({ amountMinor: 310_000, currency: "EUR" });
  });

  it("states no deposit for a provider that takes none, rather than zero", () => {
    expect(
      presentListingSummary(doc({ securityDepositMinor: null })).priceDetails.securityDeposit,
    ).toBeNull();
  });

  it("still reports the deposit for a listing with no usable price", () => {
    const summary = presentListingSummary(doc({ priceFromMinor: null }));

    expect(summary.priceFrom).toBeNull();
    expect(summary.priceDetails.securityDeposit?.amountMinor).toBe(310_000);
  });
});
