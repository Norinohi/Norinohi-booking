import type { ListingSearchDoc, PriceBasis } from "@yacht-charter/db/search";

import {
  bookablePeriodOf,
  nightsBetween,
  presentListingSummary,
  WEEKLY_RATE_DAYS,
} from "./listing";

/*
 * The card, with a price only where the price is for the charter the card names.
 *
 * `priceFrom` is the figure for one exact charter. A dated search already reads the charter the card
 * names, the dates asked for or the nearby week a flexible search moves the card onto, where a vendor
 * priced it (`listing_period_price`) and, for a week nobody quoted, the operator's published rate
 * for that week (`priceSource = 'price-list'`, a pre-discount figure the card says it is), or for
 * a charter of another length an estimate from that list (`priceSource = 'price-list-estimate'`),
 * which the card captions as one. What reaches here with other dates beside it is a listing none
 * of them priced, and nothing here reprices that charter from another one's figure.
 *
 * So such a card says "on request". It used to keep the other week's figure and caption it with
 * that week, which still printed a price beside the dates asked for: My Affair Dufour 412 GL read
 * "Boat price, for 17 Oct - 24 Oct, EUR 1,113" under a 7-14 November search. Before that the
 * figure was relabelled a seasonal minimum, which it is not either.
 */
export function pricedForShownPeriod(
  item: ListingSearchDoc,
  shown: { checkIn: string | null; checkOut: string | null },
  basis: PriceBasis,
  amenityRanks: ReadonlyMap<string, number>,
) {
  const listing = presentListingSummary(item, basis, amenityRanks);
  if (shown.checkIn === null || shown.checkOut === null) return listing;

  /*
   * A dated search already swapped in every price there is for the charter its card names, the
   * vendor's or the operator's list rate for that week, so a row it could not price holds only
   * another week's figure or a season floor, and neither names these dates. The swap keys on the
   * same choice `periodFor` makes; the check below still refuses a price for any other dates.
   */
  if (item.pricedForDates === false) return withoutPrice(listing);

  /*
   * A season floor is a week's rate, so it can stand beside a week and nothing shorter. Beside
   * three nights it read as their price; the card says "on request" instead.
   */
  if (listing.priceIsFrom) {
    return nightsBetween(shown.checkIn, shown.checkOut) === WEEKLY_RATE_DAYS
      ? listing
      : withoutPrice(listing);
  }

  /*
   * Both ends, because a charter is a length as well as a start.
   *
   * Comparing the check-in alone let the commonest version of this through untouched: a hull
   * whose shortest charter is three nights, free from the searched Saturday, was admitted for a
   * seven-night search, shown the seven-night dates it can sell, and captioned with the price of
   * the three nights it was quoted for. Star Elisabeth Oceanis 34 read "Charter price, 3 days
   * EUR 819" under "Oct 3 -> Oct 10", against EUR 1,321 for the week on the sister listing. The
   * start matched, so the guard passed, and the figure was 38% of the charter named above it.
   */
  const priced = bookablePeriodOf(item);
  return priced && priced.checkIn === shown.checkIn && priced.checkOut === shown.checkOut
    ? listing
    : withoutPrice(listing);
}

/* No figure at all, which the card renders as "on request". */
function withoutPrice<T extends ReturnType<typeof presentListingSummary>>(listing: T): T {
  return {
    ...listing,
    priceFrom: null,
    comparablePriceFrom: null,
    allInPriceFrom: null,
    basePriceFrom: null,
    listPriceFrom: null,
    priceSource: null,
  };
}
