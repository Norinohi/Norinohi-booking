import type { ListingDetail, ListingSearchDoc } from "@yacht-charter/db/search";

const EMPTY_IMAGE = "";

export function presentListingSummary(doc: ListingSearchDoc) {
  const currency = doc.currency ?? "EUR";
  const periodDays = daysBetween(doc.availableFrom, doc.availableTo) ?? 7;
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
        amountMinor: Math.round(amountMinor * 0.25),
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
    importantInformation: detail.importantInformation,
    suggestedRoute: detail.suggestedRoute,
    reviews: detail.reviews,
    faq: detail.faq,
    popularYachts: detail.popularYachts.map(presentListingSummary),
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

function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}
