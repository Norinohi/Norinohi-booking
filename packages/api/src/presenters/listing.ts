import type { ListingDetail, ListingSearchDoc } from "@yacht-charter/db/search";

import { daysBetween } from "../lib/dates";

const EMPTY_IMAGE = "";

/**
 * What a search card quotes as the up-front payment.
 *
 * This does NOT agree with the real deposit: checkout resolves it per listing
 * through resolvePaymentPolicy in services/pricing.ts, which honours a listing
 * override, then the provider's plan, then a 50% marketplace default. So a card
 * can advertise 25% on a listing the checkout will ask 50% for.
 *
 * Left as-is deliberately -- reconciling them changes a displayed price, which
 * is a product decision. Naming it is so the disagreement is visible rather
 * than buried in an expression.
 */
const CARD_PREPAYMENT_PCT = 0.25;

export type ListingSummaryOptions = {
  checkIn?: string | null;
  checkOut?: string | null;
  duration?: number | null;
};

export function presentListingSummary(doc: ListingSearchDoc, options: ListingSummaryOptions = {}) {
  const currency = doc.currency ?? "EUR";
  const periodDays =
    daysBetween(options.checkIn ?? null, options.checkOut ?? null) ??
    options.duration ??
    daysBetween(doc.availableFrom, doc.availableTo) ??
    7;
  const amountMinor = doc.priceFromMinor ?? 0;

  return {
    id: doc.listingId,
    slug: doc.slug,
    title: doc.title,
    category: doc.category ?? "Yacht",
    crewType: doc.crewType,
    badges: badgesFor(doc),
    builder: doc.builder ?? "Unknown builder",
    model: doc.model ?? "Unknown model",
    operator: doc.operator,
    base: {
      id: doc.baseId,
      name: doc.baseName,
      location: doc.location,
      region: doc.region,
      country: doc.country,
      lat: doc.lat ?? 0,
      lng: doc.lng ?? 0,
      email: doc.baseEmail,
      phone: doc.basePhone,
      website: doc.baseWebsite,
    },
    specs: {
      lengthM: Number(doc.lengthM ?? 0),
      cabins: doc.cabins ?? 0,
      berths: doc.berths ?? 0,
      heads: doc.heads ?? 0,
      yearBuilt: doc.yearBuilt ?? 0,
      sailType: doc.sailType,
    },
    policies: {
      depositInsuranceIncluded: doc.depositInsuranceIncluded,
      petsAllowed: doc.petsAllowed,
    },
    availability: {
      hasUnconfirmedAvailability: doc.hasUnconfirmedAvailability,
      hasTemporaryBooking: doc.hasTemporaryBooking,
    },
    rating: Number(doc.rating),
    reviewCount: doc.reviewCount,
    bookingStats: {
      bookedThisMonth: stableCount(doc.listingId, 2, 8),
      viewedToday: stableCount(doc.slug, 18, 64),
    },
    mainImage: doc.mainImage ?? doc.gallery[0] ?? EMPTY_IMAGE,
    gallery: doc.gallery,
    amenities: doc.amenities,
    priceFrom: {
      amountMinor,
      currency,
    },
    priceDetails: {
      periodDays,
      perPersonMinor: doc.berths ? Math.round(amountMinor / doc.berths) : null,
      bookingPrepayment: {
        amountMinor: Math.round(amountMinor * CARD_PREPAYMENT_PCT),
        currency,
      },
    },
  };
}

export function presentListingDetail(detail: ListingDetail) {
  return {
    ...presentListingSummary(detail),
    description: detail.description,
    overview: detail.overview,
    includedAmenities: detail.includedAmenities,
    mandatoryExtras: detail.mandatoryExtras,
    optionalExtras: detail.optionalExtras,
    crew: detail.crew,
    importantInformation: detail.importantInformation,
    suggestedRoute: detail.suggestedRoute,
    reviews: detail.reviews,
    faq: detail.faq,
    popularYachts: detail.popularYachts.map((listing) => presentListingSummary(listing)),
  };
}

function badgesFor(doc: ListingSearchDoc) {
  const badges = [{ code: "best-value", label: "Best value" }];
  if (doc.petsAllowed) badges.push({ code: "pets-allowed", label: "Pets allowed" });
  if (doc.depositInsuranceIncluded) {
    badges.push({ code: "deposit-insurance", label: "Deposit insurance included" });
  }
  if (doc.rating && Number(doc.rating) >= 4.8)
    badges.push({ code: "top-rated", label: "Top rated" });
  return badges;
}

function stableCount(seed: string, min: number, max: number): number {
  const spread = max - min + 1;
  const value = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + (value % spread);
}
