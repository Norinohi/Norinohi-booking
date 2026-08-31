import type { ListingDetail, ListingSearchDoc } from "@yacht-charter/db/search";

const EMPTY_IMAGE = "";

/** `listing_price_period.kind = 'weekly'` is what the read model reads, so the rate is a week. */
const WEEKLY_RATE_DAYS = 7;

/** UTC, matching the `date` columns the projection wrote against `current_date`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between two `yyyy-MM-dd` days, both read as UTC midnight. */
function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`);
  return Math.round(ms / 86_400_000);
}

export function presentListingSummary(doc: ListingSearchDoc) {
  const currency = doc.currency ?? "EUR";
  /*
   * Dropped once it has gone by: the columns are computed against the clock and are only as
   * fresh as the last projection run, and a card offering a day that has already passed
   * sends the visitor to a calendar that refuses it.
   */
  const bookablePeriod =
    doc.bookableFrom !== null && doc.bookableTo !== null && doc.bookableFrom >= todayIso()
      ? { checkIn: doc.bookableFrom, checkOut: doc.bookableTo }
      : null;

  /*
   * The period the price actually covers, which is the charter printed beside it.
   *
   * It must never be the duration the visitor searched for: a three-day search captioning a
   * week's rate "Price for 3 days" understated the trip it described by roughly 2.3x, and a
   * weekly rate cannot be prorated into a shorter one anyway — NauSYS prices dailies from a
   * separate list precisely because they are not a seventh of the week.
   *
   * A week is the fallback rather than the rule. `price_from_minor` is the rate for the
   * bookable week plus its obligatory extras (see the `money` lateral in read-model.ts), so
   * where there is a bookable period the price is that charter's, and captioning it "7 days"
   * beside "Nov 24 → Nov 28" described a charter three days longer than the one on sale. Only
   * where nothing is bookable does the figure fall back to the season minimum, and with no
   * dates printed beside it the rate's own week is the honest period to name.
   */
  const periodDays = bookablePeriod
    ? nightsBetween(bookablePeriod.checkIn, bookablePeriod.checkOut)
    : WEEKLY_RATE_DAYS;
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
      showers: doc.showers,
      yearBuilt: doc.yearBuilt ?? 0,
      sailType: doc.sailType,
    },
    policies: {
      depositInsuranceIncluded: doc.depositInsuranceIncluded,
      petsAllowed: doc.petsAllowed,
      termsAndConditions: doc.operatorTermsAndConditions,
    },
    availability: {
      hasUnconfirmedAvailability: doc.hasUnconfirmedAvailability,
      hasTemporaryBooking: doc.hasTemporaryBooking,
      // No projected window means the listing has no bookable slot at all, which
      // is a different state from having dates but no price.
      hasAvailableDates: doc.availableFrom !== null,
      bookablePeriod,
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
