import { searchListings } from "@yacht-charter/db/search";
import type { ListingSearchDoc, PriceBasis } from "@yacht-charter/db/search";
import type { z } from "zod";

import type { listingSearchInputSchema, searchResultSchema } from "../contracts/catalog";
import type { Database } from "../context";
import { type CharterPeriod, effectivePeriod } from "../lib/dates";
import { bookablePeriodOf } from "../presenters/listing";
import { pricedForShownPeriod } from "../presenters/shown-period";
import { getAmenityRanks } from "./amenity-ranks";

type SearchInput = z.output<typeof listingSearchInputSchema>;
type SearchResult = z.output<typeof searchResultSchema>;

/*
 * The dates a card carries, and whether they are the ones asked for.
 *
 * The searched period when this listing would actually sell it. When it would not -- free that
 * week, but Saturday to Saturday -- the card carries the boat's own first sellable charter
 * instead. Repeating the visitor's dates there is what sent them to a detail page that refused
 * the period and fell back to "Select dates" with nothing said about why.
 *
 * `bookablePeriodOf` is also the period `priceFrom` and `periodDays` already describe, so the
 * swap leaves the card internally consistent rather than pairing one charter's dates with
 * another's rate.
 *
 * `shownCharterStart` in packages/db makes the same choice in SQL, so the search prices, sorts and
 * filters on the charter this returns. A change to one has to be made to the other, or the card
 * names dates its price is not for and `pricedForShownPeriod` withholds it.
 */
function periodFor(item: ListingSearchDoc, period: CharterPeriod, startDate: string | undefined) {
  if (period.checkIn !== undefined && item.sellsRequestedPeriod) {
    return {
      checkIn: period.checkIn,
      checkOut: period.checkOut ?? null,
      periodIsAlternative: false,
    };
  }

  /*
   * A start date with no duration states one end and not the other, so `effectivePeriod` calls
   * that no period at all and the card fell back to the listing's own first charter -- which is
   * free to begin before the day that was actually asked for. Searching "from 16 September"
   * and being shown a week starting the 12th is the one answer the question rules out.
   *
   * `nearestCheckIn` is walked forward from the searched day, so it can only ever land on or
   * after it, and it is what the filter admitted this listing for.
   */
  if (period.checkIn === undefined && startDate === undefined) {
    /* A length with no date: the nearest charter of that length, which the search worked out
       for exactly this case. Anything else stays undated. */
    if (item.nearestCheckIn && item.nearestCheckOut) {
      return {
        checkIn: item.nearestCheckIn,
        checkOut: item.nearestCheckOut,
        periodIsAlternative: false,
      };
    }
    return { checkIn: null, checkOut: null, periodIsAlternative: false };
  }

  /*
   * The charter nearest the dates asked for, and only then the listing's own first one. The
   * fallback is what a boat with nothing sellable left near the search gets, and it is far
   * enough from the question to be worth avoiding: a September search was answered with a
   * November week because `bookablePeriodOf` is the first charter in the whole horizon.
   */
  const nearest =
    item.nearestCheckIn && item.nearestCheckOut
      ? { checkIn: item.nearestCheckIn, checkOut: item.nearestCheckOut }
      : bookablePeriodOf(item);

  /* No sellable charter to offer instead: say nothing rather than name a refused period. */
  if (!nearest) return { checkIn: null, checkOut: null, periodIsAlternative: false };

  /*
   * "Alternative" only where a period was actually named. A start date alone is answered, not
   * contradicted: the charter starts on or after the day asked for, which is what was wanted.
   */
  return {
    checkIn: nearest.checkIn,
    checkOut: nearest.checkOut,
    periodIsAlternative: period.checkIn !== undefined,
  };
}

/**
 * The price the catalogue, its filters and the map show when the visitor has not picked one: the
 * boat alone. That is the figure other charter sites quote, so it is the one a visitor comparing
 * us against them expects; the whole charter is a toggle away.
 */
export const CATALOGUE_DEFAULT_BASIS: PriceBasis = "base";

/** The catalogue results page: one card per matching listing, dated for the charter it names. */
export async function searchCharterResults(
  db: Database,
  input: SearchInput & { listingIds?: readonly string[] },
): Promise<SearchResult> {
  const [priceBasis, amenityRanks] = await Promise.all([
    input.priceBasis ?? CATALOGUE_DEFAULT_BASIS,
    getAmenityRanks(db),
  ]);
  const results = await searchListings(db, { ...input, priceBasis });
  const period = effectivePeriod(input);
  return {
    items: results.items.map((item) => ({
      listing: pricedForShownPeriod(
        item,
        periodFor(item, period, input.startDate),
        priceBasis,
        amenityRanks,
      ),
      /* One `periodFor` per item would do; it is called twice because the spread below is
         the card's own dates and the call above only reads them. Pure and cheap. */
      /*
       * The searched charter, or nothing. These used to fall back to the listing's
       * `available_from`/`available_to`, which is the outer envelope of every free slot
       * in the horizon -- so an undated search captioned each card with a year-long
       * "charter" ("19 Aug 2026 -> 19 Aug 2027") beside a weekly rate. That envelope is
       * not even a bookable stretch, since it spans the gaps between slots. The card
       * already renders without dates on the catalogue pages.
       */
      ...periodFor(item, period, input.startDate),
    })),
    nextCursor: results.nextCursor,
    pagination: results.pagination,
  };
}
