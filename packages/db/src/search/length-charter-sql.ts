import { sql, type SQL } from "drizzle-orm";

import { undatedRange } from "./candidate-range";
import { listRatePeriodPrice } from "./list-rate-sql";
import { WEEKLY_RATE_NIGHTS } from "./weekly-estimate";

/*
 * A length with no date. Each card names a charter of that length, and it only has a price when
 * one stands for exactly that charter, so the "recommended" order has to know which cards will
 * show one without working out every row's nearest sellable start, which took a "7 days" search
 * from under a second to over four.
 *
 * So the card names a priced charter where there is one: the document's stored charter where it
 * is that length and priced, else the earliest one of that length a vendor priced
 * (`listing_period_price`, already sellable and rule-checked), else the nearest sellable start.
 * The tier then follows from the same two tests. Neither is held to the search horizon: the
 * filter already admitted the listing, and a priced charter past the horizon is still its price.
 */

export const PRICED_CHARTER_TIER = 40;
const LIST_RATE_TIER = 30;
const ESTIMATE_TIER = 20;
const SEASON_WEEK_TIER = 10;

function storedPricedCharter(nights: number): SQL {
  const { earliestStart } = undatedRange(nights);
  return sql`(
    doc.price_from_minor > 0
    and not doc.price_is_from
    and doc.bookable_from >= ${earliestStart}::date
    and doc.bookable_to = doc.bookable_from + ${nights}::integer
  )`;
}

function sweptCharters(nights: number): SQL {
  const { earliestStart } = undatedRange(nights);
  return sql`
    from listing_period_price pp
    where pp.listing_id = doc.listing_id
      and pp.start_date >= ${earliestStart}::date
      and pp.end_date = pp.start_date + ${nights}::integer`;
}

/** The start of the priced charter of `nights` a card names, or null where none is priced. */
export function pricedLengthStart(nights: number): SQL {
  return sql`(case
    when ${storedPricedCharter(nights)} then doc.bookable_from
    else (select min(pp.start_date) ${sweptCharters(nights)})
  end)`;
}

/**
 * The first charter of `nights` the operator's list prices for this row, as a `listRatePeriodPrice`
 * row, or no row: the one a dated search starting that day would price. Only days some weekly band
 * covers are tried, earliest first, so a boat with no list pays one index read.
 */
export function firstListPricedCharter(listingId: SQL, nights: number): SQL | undefined {
  const { earliestStart, latestStart } = undatedRange(nights);
  const listRate = listRatePeriodPrice(listingId, sql`day.start_date`, nights);
  if (!listRate) return undefined;
  return sql`
    select priced.*
    from (
      select distinct covered::date as start_date
      from listing_price_period band
      cross join lateral generate_series(
        greatest(band.start_date, ${earliestStart}::date),
        least(band.end_date, ${latestStart}::date),
        interval '1 day'
      ) as covered
      where band.listing_id = ${listingId}
        and band.kind = 'weekly'
        and band.price_minor > 0
        and band.end_date >= ${earliestStart}::date
    ) day
    cross join lateral (${listRate}) priced
    order by day.start_date
    limit 1`;
}

/**
 * How the card for `nights` will be priced, as a rank that clears the 0..5 rating: a vendor's price
 * for the charter it names, then the operator's list rate for it, then an estimate from that list,
 * then a season floor, which a card shows only where it names no charter, then "on request". The
 * order a dated search ranks the same sources in. `pricedForShownPeriod` in packages/api makes the
 * same call on the page.
 */
export function lengthPriceTier(nights: number): SQL {
  const listed = firstListPricedCharter(sql`doc.listing_id`, nights);
  const listTier = listed
    ? sql`when exists (${listed}) then ${nights === WEEKLY_RATE_NIGHTS ? LIST_RATE_TIER : ESTIMATE_TIER}::integer`
    : sql``;
  return sql`(case
    when ${storedPricedCharter(nights)} or exists (select 1 ${sweptCharters(nights)})
      then ${PRICED_CHARTER_TIER}::integer
    ${listTier}
    when ${nights === WEEKLY_RATE_NIGHTS} and doc.price_is_from and doc.price_from_minor > 0
      then ${SEASON_WEEK_TIER}::integer
    else 0
  end)`;
}
