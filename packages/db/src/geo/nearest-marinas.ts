import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { boundingBox, boundingBoxSql } from "./bounds";
import { distanceKmSql, doubleSql } from "./distance";

export type NearestBasesInput = {
  lat: number;
  lng: number;
  limit: number;
  maxKm: number;
  /** Keep only bases the catalogue currently lists at least one boat from. */
  onlyWithListings?: boolean;
};

export type NearestBase = {
  id: string;
  name: string;
  location: string;
  /** The curated town, null until someone maps the location. See `location.city`. */
  city: string | null;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  distanceKm: number;
  /** Boats in the search read model sailing from this base. */
  listingCount: number;
};

/**
 * The charter bases closest to a point, nearest first, within `maxKm`.
 *
 * The bounding box goes first so the exact distance is computed only for bases that could be
 * inside the circle, then the circle itself cuts the corners the box admits. Listings are counted
 * from `listing_search_doc` rather than from `listing`, because a published listing can still be
 * out of fleet or unsellable, and a marina card promising boats the catalogue link does not show
 * would disagree with it. The count runs after the limit, over the few bases returned.
 *
 * Unlike `listMapMarinas`, bases are not merged by name: two vendors filing the same marina come
 * back as two rows a kilometre apart.
 */
export async function listNearestBases(
  db: NodePgDatabase<typeof schema>,
  input: NearestBasesInput,
): Promise<NearestBase[]> {
  const box = boundingBox({ lat: input.lat, lng: input.lng }, input.maxKm);
  const distance = distanceKmSql(
    doubleSql(input.lat),
    doubleSql(input.lng),
    sql`b.lat`,
    sql`b.lng`,
  );
  const withListings = input.onlyWithListings
    ? sql`and exists (select 1 from listing_search_doc doc where doc.base_id = b.id)`
    : sql``;

  const rows = await db.execute<NearestBase>(sql`
    with candidate as (
      select b.id, ${distance} as distance_km
      from base b
      where b.lat is not null
        and b.lng is not null
        and ${boundingBoxSql(sql`b.lat`, sql`b.lng`, box)}
        ${withListings}
    ),
    nearest as (
      select id, distance_km
      from candidate
      where distance_km <= ${doubleSql(input.maxKm)}
      order by distance_km asc, id asc
      limit ${input.limit}
    )
    select
      b.id,
      b.name,
      l.name as location,
      l.city,
      r.name as region,
      c.name as country,
      c.code as "countryCode",
      b.lat,
      b.lng,
      n.distance_km as "distanceKm",
      coalesce(counts.listing_count, 0)::integer as "listingCount"
    from nearest n
    join base b on b.id = n.id
    join location l on l.id = b.location_id
    join region r on r.id = l.region_id
    join country c on c.id = r.country_id
    left join (
      select doc.base_id, count(*) as listing_count
      from listing_search_doc doc
      where doc.base_id in (select id from nearest)
      group by doc.base_id
    ) counts on counts.base_id = b.id
    order by n.distance_km asc, b.id asc
  `);

  return rows.rows;
}
