import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { availabilityWindowFor, shiftDays, undatedRange } from "./candidate-range";
import { whereClause } from "./filters";
import { nearestSellableStart } from "./sellable-starts";
import { firstListPricedCharter, PRICED_CHARTER_TIER } from "./length-charter-sql";
import type { ListingSearchDoc, ListingSearchInput, PeriodPriceSource } from "./types";

type NamedCharterPrice = {
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
  priceSource: PeriodPriceSource;
};

/**
 * A length with no date names a charter of its own on every card (`nearestCheckIn`), and the
 * document's price is for its stored week, so the card captioned that week's price beside the
 * short dates. The named charter is priced the way a dated search prices its dates: the vendor's
 * row in `listing_period_price` where the sweep priced it (`listShortCharterPeriods`), else the
 * operator's list rate, or for another length an estimate from that list, for the first charter
 * the list prices (`firstListPricedCharter`). That price replaces the document's and moves the bookable charter onto
 * it, the same swap `searchDocs` makes for a dated search.
 *
 * Done for the page rather than in the query, so the sort and the price filter still read the
 * stored week: ranking every row on its own named charter needs that charter's nearest start for
 * each of them, which took a "7 days" search from under a second to over four.
 */
export async function pricedForNearestCharter(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
  items: ListingSearchDoc[],
): Promise<ListingSearchDoc[]> {
  if (!input.duration || availabilityWindowFor(input)) return items;
  const named = items.filter((item) => item.nearestCheckIn && item.nearestCheckOut);
  const vendor =
    named.length === 0 ? new Map<string, NamedCharterPrice>() : await vendorPrices(db, named);
  const unpriced = items.filter(
    (item) => item.lengthPriceTier !== PRICED_CHARTER_TIER && !vendor.has(charterKey(item)),
  );
  const listed = await listRatePrices(db, input.duration, unpriced);
  const priced = new Map([...listed, ...vendor]);

  return items.map((item) => {
    const row = priced.get(charterKey(item));
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
      priceSource: row.priceSource,
      bestOfferId: row.offerId,
      bookableFrom: row.startDate,
      bookableTo: row.endDate,
      nearestCheckIn: row.startDate,
      nearestCheckOut: row.endDate,
    };
  });
}

function charterKey(item: {
  listingId: string;
  nearestCheckIn?: string | null;
  nearestCheckOut?: string | null;
}) {
  return `${item.listingId}|${item.nearestCheckIn}|${item.nearestCheckOut}`;
}

const priceColumns = (row: string) =>
  sql.raw(`
  ${row}.listing_id as "listingId",
  ${row}.start_date::text as "startDate",
  ${row}.end_date::text as "endDate",
  ${row}.offer_id as "offerId",
  ${row}.currency,
  ${row}.all_in_minor as "allInMinor",
  ${row}.all_in_minor_eur as "allInMinorEur",
  ${row}.base_minor as "baseMinor",
  ${row}.base_minor_eur as "baseMinorEur",
  ${row}.list_all_in_minor as "listAllInMinor"`);

async function vendorPrices(db: NodePgDatabase<typeof schema>, named: ListingSearchDoc[]) {
  const { rows } = await db.execute<NamedCharterPrice>(sql`
    select ${priceColumns("pp")}, 'vendor' as "priceSource"
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
  return new Map(rows.map((row) => [priceKey(row), row]));
}

/*
 * The first charter the list prices, found from the earliest start rather than from the one the
 * card named: the named start is often a day the list cannot price, inside a vendor's notice or
 * the day a season's last band ends, while a week later it can. `lengthPriceTier` ranks the card on
 * the same charter.
 */
async function listRatePrices(
  db: NodePgDatabase<typeof schema>,
  nights: number,
  unpriced: ListingSearchDoc[],
) {
  const listed = firstListPricedCharter(sql`wanted.listing_id`, nights);
  if (!listed || unpriced.length === 0) return new Map<string, NamedCharterPrice>();
  const { rows } = await db.execute<NamedCharterPrice & { namedStart: string | null }>(sql`
    select wanted.named_start::text as "namedStart", ${priceColumns("lr")}, lr.price_source as "priceSource"
    from unnest(
      ${sqlArray(unpriced.map((item) => item.listingId))}::text[],
      ${sqlArray(unpriced.map((item) => item.nearestCheckIn))}::date[]
    ) as wanted(listing_id, named_start)
    cross join lateral (${listed}) lr
  `);
  return new Map(
    rows.map(({ namedStart, ...row }) => [
      charterKey({
        listingId: row.listingId,
        nearestCheckIn: namedStart,
        nearestCheckOut: namedStart && shiftDays(namedStart, nights),
      }),
      row,
    ]),
  );
}

function priceKey(row: NamedCharterPrice) {
  return `${row.listingId}|${row.startDate}|${row.endDate}`;
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
