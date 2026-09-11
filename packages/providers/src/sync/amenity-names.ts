import { sql } from "drizzle-orm";

import type { Database } from "../registry";
import { canonicalAmenityNames } from "../shared/amenity-names";

export type CanonicalAmenityNameReport = {
  /** Amenity rows whose canonical name changed. */
  updated: number;
  /** Listings carrying one of them, whose search documents are now stale. */
  affectedListings: string[];
};

/**
 * Writes `amenity.canonical_name` from the grouping map, for rows that already exist.
 *
 * The catalogue sync writes the same column on every run, so this is not how the column is
 * normally kept: it is how an edit to the map reaches a catalogue without waiting for a sync,
 * which for Booking Manager is twenty-five minutes of vendor calls to recover something already
 * sitting in our own tables. Same purpose as `rebuild-search-docs`, one table earlier.
 *
 * The returned listing ids are the point of the second statement. Aliasing an amenity changes
 * what its listings' search documents should say and nothing else in the catalogue, so the
 * caller can rebuild those rather than the whole published fleet.
 *
 * Idempotent, and it clears as well as it writes: a code the map no longer names goes back to
 * naming itself, so removing an entry is as effective as adding one.
 */
export async function applyCanonicalAmenityNames(
  db: Database,
): Promise<CanonicalAmenityNameReport> {
  const groups = canonicalAmenityNames();
  const values = sql.join(
    [...groups].map(([code, canonical]) => sql`(${code}, ${canonical})`),
    sql`, `,
  );

  const changed = await db.execute<{ id: string }>(sql`
    with mapped(code, canonical) as (values ${values})
    update amenity a
    set canonical_name = mapped.canonical
    from mapped
    where a.code = mapped.code
      and a.canonical_name is distinct from mapped.canonical
    returning a.id
  `);

  const cleared = await db.execute<{ id: string }>(sql`
    with mapped(code, canonical) as (values ${values})
    update amenity a
    set canonical_name = null
    where a.canonical_name is not null
      and not exists (select 1 from mapped where mapped.code = a.code)
    returning a.id
  `);

  const amenityIds = [...changed.rows, ...cleared.rows].map((row) => row.id);
  if (amenityIds.length === 0) return { updated: 0, affectedListings: [] };

  const listings = await db.execute<{ listingId: string }>(sql`
    select distinct listing_id as "listingId"
    from listing_amenity
    where amenity_id in (${sql.join(
      amenityIds.map((id) => sql`${id}`),
      sql`, `,
    )})
  `);

  return {
    updated: amenityIds.length,
    affectedListings: listings.rows.map((row) => row.listingId),
  };
}
