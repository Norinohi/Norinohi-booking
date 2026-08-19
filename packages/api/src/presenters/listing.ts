import type { ListingDetail, ListingSearchDoc } from "@yacht-charter/db/search";

const EMPTY_IMAGE = "";

/** `listing_price_period.kind = 'weekly'` is what the read model reads, so the rate is a week. */
const WEEKLY_RATE_DAYS = 7;

export function presentListingSummary(doc: ListingSearchDoc) {
  const currency = doc.currency ?? "EUR";
  /*
   * The period the "from" price actually covers, which is a week: `price_from_minor` is the
   * cheapest WEEKLY rate the provider published.
   *
   * It used to be the duration the visitor searched for, so a three-day search captioned a
   * week's rate "Price for 3 days" — an understatement of roughly 2.3x on the trip it was
   * describing. A weekly rate cannot be prorated into a shorter one either: NauSYS prices
   * dailies from a separate list precisely because they are not a seventh of the week. The
   * caption therefore names the rate's own period, and the quote prices the real trip.
   */
  const periodDays = WEEKLY_RATE_DAYS;
  // A non-positive price is a provider saying "no price", not "free", so it is
  // treated the same as a missing one rather than quoted as 0.
  const amountMinor =
    doc.priceFromMinor !== null && doc.priceFromMinor > 0 ? doc.priceFromMinor : null;

  return {
    id: doc.listingId,
    slug: doc.slug,
    title: doc.title,
    category: doc.category ?? "Yacht",
    crewType: doc.crewType,
    badges: badgesFor({
      petsAllowed: doc.petsAllowed,
      depositInsuranceIncluded: doc.depositInsuranceIncluded,
      rating: Number(doc.rating),
    }),
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
      checkInTime: doc.baseCheckInTime,
      checkOutTime: doc.baseCheckOutTime,
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
      // No projected window means the listing has no bookable slot at all, which
      // is a different state from having dates but no price.
      hasAvailableDates: doc.availableFrom !== null,
    },
    rating: Number(doc.rating),
    reviewCount: doc.reviewCount,
    /*
     * Real counts off our own tables: confirmed bookings this month, and distinct
     * viewers today. Zero is a legitimate answer and is passed through as zero --
     * the UI drops a line it cannot fill rather than inventing a floor for it.
     */
    bookingStats: {
      bookedThisMonth: doc.bookedThisMonth,
      viewedToday: doc.viewedToday,
    },
    mainImage: doc.mainImage ?? doc.gallery[0] ?? EMPTY_IMAGE,
    gallery: doc.gallery,
    amenities: doc.amenities,
    priceFrom: amountMinor === null ? null : { amountMinor, currency },
    priceDetails: {
      periodDays,
      perPersonMinor:
        amountMinor !== null && doc.berths ? Math.round(amountMinor / doc.berths) : null,
      /*
       * The provider's refundable damage deposit, taken by the base at check-in and
       * returned after check-out. Indicative like `priceFrom`: a NauSYS offer states
       * its own `depositAmount`, which wins over this catalogue figure at quote time.
       *
       * This replaced a fabricated "prepayment" that was a fixed percentage of the
       * price, labelled to the guest as a refundable deposit. Nothing refunded that
       * number, because nothing charged it.
       */
      securityDeposit:
        doc.securityDepositMinor === null
          ? null
          : {
              amountMinor: doc.securityDepositMinor,
              currency: doc.securityDepositCurrency ?? currency,
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

export type BadgeInput = {
  petsAllowed: boolean;
  depositInsuranceIncluded: boolean;
  rating: number;
};

/** Shared with the My Bookings card, which badges from a booking's frozen snapshot rather than a live doc. */
export function badgesFor(input: BadgeInput) {
  const badges = [{ code: "best-value", label: "Best value" }];
  if (input.petsAllowed) badges.push({ code: "pets-allowed", label: "Pets allowed" });
  if (input.depositInsuranceIncluded) {
    badges.push({ code: "deposit-insurance", label: "Deposit insurance included" });
  }
  if (input.rating >= 4.8) badges.push({ code: "top-rated", label: "Top rated" });
  return badges;
}
