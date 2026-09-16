import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { normalizedKey, normalizedKeySql } from "./normalize";

export type CatalogueCountry = {
  /** The English name, which is the value the search `country` filter matches. */
  name: string;
  /** ISO 3166-1 alpha-2, e.g. "HR". */
  code: string;
  /** Boats in the search read model sailing from a base in this country. */
  listingCount: number;
};

/**
 * Every country in the geography tables with the number of catalogue boats sailing from it,
 * most boats first.
 *
 * Counted through the base rather than grouped on `listing_search_doc.country`, because only the
 * geography row carries the ISO code. `onlyListed` drops the countries no boat sails from; left
 * off, a synced country with an empty fleet still resolves, so a caller that names one gets its
 * name and code rather than nothing. `name` narrows to one country by its folded name, so a
 * caller resolving a single destination does not count the whole catalogue.
 */
export async function listCatalogueCountries(
  db: NodePgDatabase<typeof schema>,
  input: { onlyListed?: boolean; name?: string } = {},
): Promise<CatalogueCountry[]> {
  const byName =
    input.name === undefined
      ? sql``
      : sql`where ${normalizedKeySql(sql`c.name`)} = ${normalizedKey(input.name)}`;
  const listedOnly = input.onlyListed ? sql`having count(doc.listing_id) > 0` : sql``;

  const rows = await db.execute<CatalogueCountry>(sql`
    select
      c.name,
      c.code,
      count(doc.listing_id)::integer as "listingCount"
    from country c
    left join region r on r.country_id = c.id
    left join location l on l.region_id = r.id
    left join base b on b.location_id = l.id
    left join listing_search_doc doc on doc.base_id = b.id
    ${byName}
    group by c.id, c.name, c.code
    ${listedOnly}
    order by "listingCount" desc, c.name asc
  `);

  return rows.rows;
}
