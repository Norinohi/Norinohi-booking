import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { availabilityWindowFor, undatedRange } from "./candidate-range";
import { whereClause } from "./filters";
import { nearestSellableStart } from "./sellable-starts";
import type { ListingSearchDoc, ListingSearchInput } from "./types";

/**
 * A length with no date names a charter of its own on every card (`nearestCheckIn`), and the
 * document's price is for its stored week, so the card captioned that week's price beside the
 * short dates. Where the sweep has priced the named charter (`listShortCharterPeriods`), its
 * row in `listing_period_price` replaces the price and moves the bookable charter onto it, the
 * same swap `searchDocs` makes for a dated search.
 *
 * Done for the page rather than in the query, so the sort and the price filter still read the
 * stored week: a sweep reaches a few hundred short charters, and ranking the priced ones against
 * weeks would reorder the page by which charters happened to be asked about.
 */
export async function pricedForNearestCharter(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
  items: ListingSearchDoc[],
): Promise<ListingSearchDoc[]> {
  if (!input.duration || availabilityWindowFor(input)) return items;
  const named = items.filter((item) => item.nearestCheckIn && item.nearestCheckOut);
  if (named.length === 0) return items;

  const { rows } = await db.execute<{
    listingId: string;
    startDate: string;
    endDate: string;
    offerId: string;
    currency: string;
    allInMinor: number;
    allInMinorEur: number | null;
    baseMinor: number;
    baseMinorEur: number | null;
    listAllInMinor: number | null;
  }>(sql`
    select
      pp.listing_id as "listingId",
      pp.start_date::text as "startDate",
      pp.end_date::text as "endDate",
      pp.offer_id as "offerId",
      pp.currency,
      pp.all_in_minor as "allInMinor",
      pp.all_in_minor_eur as "allInMinorEur",
      pp.base_minor as "baseMinor",
      pp.base_minor_eur as "baseMinorEur",
      pp.list_all_in_minor as "listAllInMinor"
    from listing_period_price pp
    join unnest(
      ${sqlArray(named.map((item) => item.listingId))}::text[],
      ${sqlArray(named.map((item) => item.nearestCheckIn))}::date[],
      ${sqlArray(named.map((item) => item.nearestCheckOut))}::date[]
    ) as wanted(listing_id, start_date, end_date)
      on wanted.listing_id = pp.listing_id
     and wanted.start_date = pp.start_date
     and wanted.end_date = pp.end_date
  `);
  const priced = new Map(
    rows.map((row) => [`${row.listingId}|${row.startDate}|${row.endDate}`, row]),
  );

  return items.map((item) => {
    const row = priced.get(`${item.listingId}|${item.nearestCheckIn}|${item.nearestCheckOut}`);
    if (!row) return item;
    return {
      ...item,
      priceFromMinor: row.allInMinor,
      priceFromMinorEur: row.allInMinorEur,
      basePriceFromMinor: row.baseMinor,
      basePriceFromMinorEur: row.baseMinorEur,
      listPriceFromMinor: row.listAllInMinor,
      currency: row.currency,
      priceIsFrom: false,
      bestOfferId: row.offerId,
      bookableFrom: row.startDate,
      bookableTo: row.endDate,
    };
  });
}

function sqlArray(values: readonly (string | null)[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]`;
}

/**
 * The short charters the cards name under a length filter, most-named first, for the confirming
 * sweep to price.
 *
 * The sweep reads what to ask about from `listAdvertisedCharterPeriods`, which is each card's
 * stored charter and so nearly always a week. A "3 days" search names another charter on every
 * card -- `nearestCheckIn` -- and nothing ever priced it, so the card captioned a different
 * week's price beside those dates. This is that same nearest charter, found by the same filter
 * and the same `nearestSellableStart`, grouped the way the advertised periods are.
 *
 * Only the undated filter: a dated search starts on whatever day the visitor picks, which no
 * sweep can anticipate. Capped per length because the counts are steep -- on the local fleet the
 * top thirty periods of each length cover 85% to all of its cards -- and every period costs a
 * vendor call.
 */
export async function listShortCharterPeriods(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode: string; lengths: readonly number[]; perLength: number },
): Promise<{ startDate: string; endDate: string; listings: number; yachtIds: string[] }[]> {
  const periods = [];
  for (const nights of options.lengths) {
    const range = undatedRange(nights);
    const { rows } = await db.execute<{
      startDate: string;
      endDate: string;
      listings: number;
      yachtIds: string[];
    }>(sql`
      select
        nearest.start_date as "startDate",
        (nearest.start_date + ${nights}::integer)::date as "endDate",
        count(*)::int as listings,
        coalesce(
          array_agg(distinct src.external_yacht_id) filter (where src.external_yacht_id is not null),
          '{}'
        ) as "yachtIds"
      from listing_search_doc doc
      join listing_offer o on o.id = doc.best_offer_id
      join provider p on p.id = o.provider_id
      left join listing_source src on src.id = o.listing_source_id
      cross join lateral (
        select ${nearestSellableStart(range.earliestStart, nights, range)} as start_date
      ) nearest
      where p.code = ${options.providerCode}
        and nearest.start_date is not null
        and ${whereClause({ duration: nights })}
      group by nearest.start_date
      order by count(*) desc, nearest.start_date asc
      limit ${options.perLength}
    `);
    periods.push(...rows);
  }
  return periods;
}
