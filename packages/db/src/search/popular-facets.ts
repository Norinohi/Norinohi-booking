import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";

import type * as schema from "../schema/index";
import type { FacetMediaKind } from "./types";

/**
 * Which column of the read model a curated facet kind names.
 *
 * The same expressions the facet queries group on, so a value offered on the admin screen is a
 * value the filter can actually match. `location` is the one kind with no facet group of its
 * own -- the panel filters places through countries, regions and marinas -- and it is listed
 * anyway because facet_media carries editorial copy for locations that the map cards read.
 */
const COLUMN_BY_KIND = {
  country: sql`doc.country`,
  region: sql`doc.region`,
  location: sql`doc.location`,
  marina: sql`doc.base_name`,
  category: sql`doc.category`,
  crew: sql`doc.crew_type`,
  sail_type: sql`doc.sail_type`,
  /* Amenities are a jsonb array, so this one is unnested rather than selected. See below. */
  equipment: sql`amenity.value`,
} satisfies Record<FacetMediaKind, SQL>;

export type CuratableFacetValue = {
  label: string;
  count: number;
};

/**
 * Every value of one facet kind the catalogue currently carries, with how many listings do.
 *
 * Deliberately *not* `listSearchFacets`: that narrows each group by the search's other filters
 * and computes a "from" price per option, neither of which an editor curating a marketplace-wide
 * list has any use for. This is the unfiltered vocabulary, which is the only thing that makes
 * "pick from the live values" mean what it says.
 *
 * Grouped and labelled exactly as the facet queries do -- normalized key, modal spelling -- so
 * a value picked here is one option in the filter panel rather than one of two spellings of it.
 */
export async function listCuratableFacetValues(
  db: NodePgDatabase<typeof schema>,
  kind: FacetMediaKind,
): Promise<CuratableFacetValue[]> {
  const column = COLUMN_BY_KIND[kind];
  const source =
    kind === "equipment"
      ? sql`listing_search_doc doc
          cross join lateral jsonb_array_elements_text(doc.amenities) amenity(value)`
      : sql`listing_search_doc doc`;

  const rows = await db.execute<CuratableFacetValue>(sql`
    select
      mode() within group (order by ${column}) as label,
      count(distinct doc.listing_id)::integer as count
    from ${source}
    where ${column} is not null and ${column} <> ''
    group by regexp_replace(replace(lower(${column}), '&', 'and'), '[^a-z0-9]+', '', 'g')
    order by label asc
  `);

  return rows.rows;
}
