import type { ListingSearchDoc, PriceBasis } from "@yacht-charter/db/search";

import { bookablePeriodOf, presentListingSummary } from "./listing";

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
  if (listing.priceIsFrom || shown.checkIn === null) return listing;

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

  return priced ? { ...listing, pricedPeriod: priced } : { ...listing, priceIsFrom: true };
}
