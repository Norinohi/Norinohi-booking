import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { valueForLabel, whereClause } from "./filters";
import { placeWordsKeySql } from "./normalize";
import { comparablePrice, pricedForDates, publishedPrice, searchDocs } from "./pricing-sql";
import type { ListingSearchInput, MapMarinaMarker } from "./types";

/**
 * The search's boats, grouped into the marinas they sit at.
 *
 * Same `whereClause` the list runs on, so the map and the results can never disagree about what
 * matches. Ungrouped this answer is unbounded — a catalogue of tens of thousands of hulls — and the
 * limit that used to bound it is what left most of the map empty. Grouped it is one row per base,
 * of which there are hundreds, so nothing has to be left out.
 *
 * Grouped by the marina's name within its country rather than by `base_id`, because the two
 * vendors each file their own base for the same marina: Pula's "Marina Polesana" was two pins, 43
 * boats and 113, a kilometre and a half apart, and a visitor who opened one saw a third of the
 * marina and a catalogue link that disagreed with it. Every same-name pair in the catalogue sits
 * within 1.5 km, so the name is the marina, read as its words in any order (`placeWordsKey`), since
 * one vendor writes "Marina Zenta, Split" and the other "Split / Marina Zenta". The coordinates are averaged over the boats, which
 * lands the pin between the two vendors' readings of one quay.
 */
export async function listMapMarinas(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<MapMarinaMarker[]> {
  const basis = input.priceBasis;
  const rows = await db.execute<Omit<MapMarinaMarker, "value">>(sql`
    select
      min(doc.base_id) as "baseId",
      min(doc.base_name) as name,
      avg(doc.lat)::double precision as lat,
      avg(doc.lng)::double precision as lng,
      count(*)::integer as count,
      /* The cheapest boat's own price, picked in a single currency so the comparison holds, then
         reported in the currency it was actually priced in. */
      (array_agg(${publishedPrice(basis)} order by ${comparablePrice(basis)} asc nulls last)
        filter (where ${pricedForDates(input)}))[1]::integer as "priceFromMinor",
      (array_agg(doc.currency order by ${comparablePrice(basis)} asc nulls last)
        filter (where ${pricedForDates(input)}))[1] as currency
    from ${searchDocs(input)} doc
    where ${whereClause(input)}
      and doc.base_id is not null
      and doc.lat is not null
      and doc.lng is not null
    group by doc.country, ${placeWordsKeySql(sql`doc.base_name`)}
  `);

  return rows.rows.map((row) => ({ ...row, value: valueForLabel(row.name) }));
}
