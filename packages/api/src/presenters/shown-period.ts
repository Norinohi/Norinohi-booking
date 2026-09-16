import type { ListingSearchDoc, PriceBasis } from "@yacht-charter/db/search";

import {
  bookablePeriodOf,
  nightsBetween,
  presentListingSummary,
  WEEKLY_RATE_DAYS,
} from "./listing";

/*
 * The card, with its price captioned for the charter the card actually names.
 *
 * `priceFrom` is the vendor's confirmed figure for one exact week. A dated search already reads
 * the week asked for where a vendor priced it (`listing_period_price`), so what reaches here with
 * other dates beside it is a listing nobody priced for them, and nothing here can reprice
 * another week: the published rate list is the pre-discount number both vendors sell below, and
 * no arithmetic turns a week into a charter of another length.
 *
 * So the figure keeps its own week and the card names it. It used to be relabelled a seasonal
 * minimum, which it is not: Kepi Lagoon 52 read EUR 7,500 "seasonal minimum" beside 17-24
 * October, a week its vendor sold for EUR 6,000.
 */
export function pricedForShownPeriod(
  item: ListingSearchDoc,
  shown: { checkIn: string | null; checkOut: string | null },
  basis: PriceBasis,
  amenityRanks: ReadonlyMap<string, number>,
) {
  const listing = presentListingSummary(item, basis, amenityRanks);
  if (shown.checkIn === null || shown.checkOut === null) return listing;
  const shownNights = nightsBetween(shown.checkIn, shown.checkOut);

  /*
   * A season floor is a week's rate, so it can stand beside a week and nothing shorter. Beside
   * three nights it read as their price; the card says "on request" instead.
   */
  if (listing.priceIsFrom) {
    return shownNights === WEEKLY_RATE_DAYS ? listing : withoutPrice(listing);
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
  if (priced && priced.checkIn === shown.checkIn && priced.checkOut === shown.checkOut) {
    return listing;
  }

  if (!priced) return { ...listing, priceIsFrom: true };
  /*
   * Another week of the same length is still worth naming. A charter of another length is not:
   * a "3 days" card beside a week's price, captioned with that week, answered a question nobody
   * asked, and the sweep prices the short charter itself where it can.
   */
  return nightsBetween(priced.checkIn, priced.checkOut) === shownNights
    ? { ...listing, pricedPeriod: priced }
    : withoutPrice(listing);
}

/* No figure at all, which the card renders as "on request". */
function withoutPrice<T extends ReturnType<typeof presentListingSummary>>(listing: T): T {
  return {
    ...listing,
    priceFrom: null,
    allInPriceFrom: null,
    basePriceFrom: null,
    listPriceFrom: null,
    pricedPeriod: null,
  };
}
