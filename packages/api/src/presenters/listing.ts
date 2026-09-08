import { MIN_LEAD_DAYS } from "@yacht-charter/db/search";
import type { ListingDetail, ListingSearchDoc, PriceBasis } from "@yacht-charter/db/search";

const EMPTY_IMAGE = "";

/** `listing_price_period.kind = 'weekly'` is what the read model reads, so the rate is a week. */
export const WEEKLY_RATE_DAYS = 7;

/** UTC, matching the `date` columns the projection wrote against `current_date`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `yyyy-MM-dd`, `days` whole days after today, read and returned in UTC. */
function daysFromTodayIso(days: number): string {
  return new Date(Date.parse(`${todayIso()}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Whole days between two `yyyy-MM-dd` days, both read as UTC midnight. */
function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * The charter the card's price, dates and terms describe, or null when the listing has none.
 *
 * Dropped once it is too close to sell. The projection applies the same MIN_LEAD_DAYS floor when
 * it chooses among candidates, so it no longer stores a period this can reject on a run of its
 * own; what survives is the day that passes between runs, and this is the guard against it. A
 * card offering a day that has already passed sends the visitor to a calendar that refuses it,
 * and one offering today sends them to a checkout for a boat that sails this afternoon.
 *
 * Null here still costs the listing its dates and its price caption, which is why the floor
 * belongs upstream too: there is no second candidate at this end of the pipeline to fall back to.
 */
export function bookablePeriodOf(doc: ListingSearchDoc) {
  const earliest = daysFromTodayIso(MIN_LEAD_DAYS);
  return doc.bookableFrom !== null && doc.bookableTo !== null && doc.bookableFrom >= earliest
    ? { checkIn: doc.bookableFrom, checkOut: doc.bookableTo }
    : null;
}

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
 *
 * The other direction is settled upstream rather than here: an advertised period has no
 * price at all unless the vendor priced that exact charter, because the only other figure
 * available is the published list rate, which both vendors discount off and which no
 * arithmetic turns into a charter of another length. So this count captions a figure of the
 * same length or captions nothing.
 *
 * It is also what makes two listings' prices comparable, which is why the planner reads it:
 * a min and a max taken across a page that mixed a week and a long weekend described no
 * fleet that exists.
 */
export function pricedPeriodDays(doc: ListingSearchDoc): number {
  /*
   * A "from" figure is the season's weekly floor whether or not a charter is advertised beside
   * it, so its own week is the period to name. The bookable period's length may only caption a
   * figure that prices that period, which is what `price_is_from = false` asserts.
   *
   * Reading the dates alone was wrong for every listing whose advertised charter came from the
   * inferred branch of the projection, where a period is proven legal but nothing prices it --
   * Lagoon 52 my-one-lagoon-52-f-5-cab-28481585 sells single nights under its 2026 rule, and its
   * EUR 7,700 weekly floor was captioned "Price for 1 day".
   */
  const bookablePeriod = doc.priceIsFrom ? null : bookablePeriodOf(doc);
  return bookablePeriod
    ? nightsBetween(bookablePeriod.checkIn, bookablePeriod.checkOut)
    : WEEKLY_RATE_DAYS;
}

/**
 * One card, priced on whichever figure the catalogue is set to show.
 *
 * `priceFrom` is the headline, and it is the only field the basis moves: `allInPriceFrom` and
 * `basePriceFrom` are always both filled, so a page showing the rate can also say what the
 * obligatory extras add without asking a second question. That disclosure is the client's own
 * condition for showing the rate at all -- extras are not to be hidden, only moved out of the
 * headline.
 */
export function presentListingSummary(doc: ListingSearchDoc, basis: PriceBasis = "all_in") {
  const currency = doc.currency ?? "EUR";
  const bookablePeriod = bookablePeriodOf(doc);
  const periodDays = pricedPeriodDays(doc);
  // A non-positive price is a provider saying "no price", not "free", so it is
  // treated the same as a missing one rather than quoted as 0.
  const allInMinor =
    doc.priceFromMinor !== null && doc.priceFromMinor > 0 ? doc.priceFromMinor : null;
  const baseMinor =
    doc.basePriceFromMinor !== null && doc.basePriceFromMinor > 0 ? doc.basePriceFromMinor : null;
  /* The rate is never shown without the total it belongs to: a card that lost one of the two
     would advertise a figure with no way to say what sits on top of it. */
  const amountMinor = basis === "base" && baseMinor !== null ? baseMinor : allInMinor;

  return {
    id: doc.listingId,
    slug: doc.slug,
    name: doc.name ?? null,
    title: doc.title,
    category: doc.category ?? "Yacht",
    crewType: doc.crewType,
    badges: badgesFor({
      petsAllowed: doc.petsAllowed,
      depositInsuranceIncluded: doc.depositInsuranceIncluded,
      rating: Number(doc.rating),
      ratingCount: doc.reviewCount,
      bestValue: doc.bestValue,
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
    /*
     * Both figures, whatever the headline is, so a card can disclose the difference and a
     * detail page can break it down without a second read.
     */
    allInPriceFrom: allInMinor === null ? null : { amountMinor: allInMinor, currency },
    basePriceFrom: baseMinor === null ? null : { amountMinor: baseMinor, currency },
    /*
     * Whether that figure prices the charter beside it or merely starts from the season, which
     * is what the card's caption turns on: an indicative floor captioned "Price for 7 days"
     * claims to price a week nobody has quoted.
     */
    /*
     * "From" also once the charter the figure was attached to has gone.
     *
     * `price_is_from` is decided when the projection runs, against the bookable period it found
     * then; `bookablePeriodOf` re-tests that period at read time and now also drops one too
     * close to sell. Between the two, a doc can carry a confirmed price for a charter this
     * request will not show -- Zadar Damor 800 held a 1-night rate for today, which the lead
     * time retired and `pricedPeriodDays` then captioned "Price for 7 days". A figure whose
     * charter is gone is a floor, not the price of a named week, so it is captioned as one.
     */
    priceIsFrom: doc.priceIsFrom || bookablePeriod === null,
    /*
     * The same charter before the operator's discount, for the card to strike through. Only
     * ever beside a price and only ever above it: a listing whose price was withheld has
     * nothing to strike, and the projection never writes a figure that does not exceed it.
     */
    listPriceFrom:
      allInMinor === null || doc.listPriceFromMinor === null
        ? null
        : { amountMinor: doc.listPriceFromMinor, currency },
    priceDetails: {
      periodDays,
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
      /* Only ever shown against an ordinary deposit, so an insured figure without one is
         withheld rather than left to stand on its own as "the deposit". */
      securityDepositWhenInsured:
        doc.securityDepositWhenInsuredMinor === null || doc.securityDepositMinor === null
          ? null
          : {
              amountMinor: doc.securityDepositWhenInsuredMinor,
              currency: doc.securityDepositCurrency ?? currency,
            },
    },
  };
}

export function presentListingDetail(detail: ListingDetail, basis: PriceBasis = "all_in") {
  return {
    ...presentListingSummary(detail, basis),
    description: detail.description,
    overview: detail.overview,
    media: detail.media,
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
  /**
   * How many guests scored it, which is what makes the score a score.
   *
   * The read model falls back to the provider's own aggregate where nobody has reviewed the boat
   * here, and a provider may publish a rating with no count behind it at all -- Auszeit Dufour
   * 430 carries a flat 5.00 off zero. The page says "the score comes from N guest ratings" under
   * the number, so at N of zero there is no sentence to write and no claim to badge.
   */
  ratingCount: number;
  /**
   * Earned in the read model: the cheapest quarter of this hull's own model.
   *
   * Absent on the booking snapshot, which froze before the flag existed and has no cohort to
   * compare against anyway -- a card recapping a charter somebody already bought is not a place
   * to advertise how the price compared to its peers.
   */
  bestValue?: boolean;
};

/** Shared with the My Bookings card, which badges from a booking's frozen snapshot rather than a live doc. */
export function badgesFor(input: BadgeInput) {
  const badges: { code: string; label: string }[] = [];
  if (input.bestValue) badges.push({ code: "best-value", label: "Best value" });
  if (input.petsAllowed) badges.push({ code: "pets-allowed", label: "Pets allowed" });
  if (input.depositInsuranceIncluded) {
    badges.push({ code: "deposit-insurance", label: "Deposit insurance included" });
  }
  if (input.rating >= 4.8 && input.ratingCount > 0) {
    badges.push({ code: "top-rated", label: "Top rated" });
  }
  return badges;
}
