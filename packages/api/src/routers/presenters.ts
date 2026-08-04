import type { ListingSearchDoc } from "@yacht-charter/db/search";

const EMPTY_IMAGE = "";

export function presentListingSummary(doc: ListingSearchDoc) {
  return {
    id: doc.listingId,
    slug: doc.slug,
    title: doc.title,
    category: doc.category ?? "Yacht",
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
    },
    rating: Number(doc.rating),
    reviewCount: doc.reviewCount,
    mainImage: doc.mainImage ?? doc.gallery[0] ?? EMPTY_IMAGE,
    gallery: doc.gallery,
    amenities: doc.amenities,
    priceFrom: {
      amountMinor: doc.priceFromMinor ?? 0,
      currency: doc.currency ?? "EUR",
    },
  };
}
