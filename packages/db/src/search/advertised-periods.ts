import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema";

/**
 * The hulls the standing grid exists for: those whose card advertises no charter at all.
 *
 * The grid is the half of the sweep that guesses, so it is the half that has to guess narrowly.
 * Asked about the whole fleet it re-priced hulls that already advertise a week the targeted
 * half just confirmed -- 7,484 NauSYS hulls against the 493 with nothing to advertise, which
 * at one call per 250 is 30 calls a window instead of 2, and 780 calls instead of 52 across
 * the grid. That is most of a budget spent re-answering an answered question, and it is why a
 * truncated pass never got back to the front of its own list.
 *
 * Narrowing costs nothing this projection can measure: no NauSYS hull holds a confirmed week
 * earlier than the one its card advertises, so the grid was not rescuing dated cards, only the
 * undated ones it is documented to rescue. Scoped by `best_offer_id` for the same reason
 * `listAdvertisedCharterPeriods` is -- the offer the card is priced from is the vendor whose
 * sweep should cover it.
 */
export async function listUnadvertisedYachtIds(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode: string },
): Promise<string[]> {
  const { rows } = await db.execute<{ yachtId: string }>(sql`
    select distinct src.external_yacht_id as "yachtId"
    from listing_search_doc doc
    join listing_offer o on o.id = doc.best_offer_id
    join provider p on p.id = o.provider_id
    join listing_source src on src.id = o.listing_source_id
    where doc.bookable_from is null
      and p.code = ${options.providerCode}
      and src.external_yacht_id is not null
  `);

  return rows.map((row) => row.yachtId);
}

/**
 * The charters the cards are currently advertising, most-advertised first.
 *
 * The confirming sweep exists to replace a published list rate with the price the vendor
 * itself quotes, and it can only do that for periods it actually asks about. Asking about a
 * fixed grid of Saturdays instead left the sweep and the cards describing different charters:
 * roughly half the NauSYS fleet advertises a week the vendor discounts — 30% and 35% are
 * ordinary — and every card whose week the sweep missed printed the undiscounted list price
 * beside a quote that then came in hundreds of euro lower.
 *
 * Scoped by `best_offer_id`, which is the offer the card is priced from and therefore the
 * vendor whose sweep should cover it. Past periods are excluded: they are what a stale doc
 * advertises, not what anyone can buy.
 *
 * `yachtIds` is the fleet each period actually needs. A vendor priced per hull was being asked
 * about all 7,484 of them for a week 110 of them advertise, which cost the pass its whole
 * clock budget three periods in; see `SweepPeriod.yachtIds`. Null-safe by construction: a doc
 * whose offer carries no source row contributes no id, and a period left with none is one the
 * sweep skips rather than asks blindly.
 */
export async function listAdvertisedCharterPeriods(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode: string; limit: number },
): Promise<{ startDate: string; endDate: string; listings: number; yachtIds: string[] }[]> {
  const { rows } = await db.execute<{
    startDate: string;
    endDate: string;
    listings: number;
    yachtIds: string[];
  }>(sql`
    select
      doc.bookable_from as "startDate",
      doc.bookable_to as "endDate",
      count(*)::int as listings,
      coalesce(
        array_agg(distinct src.external_yacht_id) filter (where src.external_yacht_id is not null),
        '{}'
      ) as "yachtIds"
    from listing_search_doc doc
    join listing_offer o on o.id = doc.best_offer_id
    join provider p on p.id = o.provider_id
    left join listing_source src on src.id = o.listing_source_id
    where doc.bookable_from is not null
      and doc.bookable_from >= current_date
      and p.code = ${options.providerCode}
    group by doc.bookable_from, doc.bookable_to
    order by count(*) desc, doc.bookable_from asc
    limit ${options.limit}
  `);

  return rows;
}
