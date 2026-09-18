import { sql, type SQL } from "drizzle-orm";
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

/*
 * The shared end of both reads: the rows of a `nearest (id, distance_km)` CTE named in full, with
 * their listing counts. The count runs after the limit, over the few bases returned. `extra` adds
 * columns the caller's CTE carries, and `order` is how they come back.
 */
function describeNearest(extra: SQL, order: SQL = sql`n.distance_km asc, b.id asc`): SQL {
  return sql`
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
      ${extra}
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
    order by ${order}
  `;
}

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
    ${describeNearest(sql``)}
  `);

  return rows.rows;
}

export type RouteStopPoint = { name: string; lat: number; lng: number };

export type BaseNearRoute = NearestBase & {
  /** The stop this base is closest to, and its place in the itinerary from 0. */
  nearStop: string;
  nearStopIndex: number;
};

/**
 * The bases with boats within `maxKm` of any stop of an itinerary, each measured to the stop it is
 * closest to, in the order the route reaches those stops and nearest first within one.
 *
 * Every stop, not only the start: a charter can pick a boat up in Trogir or Makarska and still sail
 * a route written from Split, and a route that ends somewhere else has marinas at that end too.
 * The prefilter is one bounding box per stop rather than one around the whole route, which for a
 * route crossing a gulf would be mostly sea and inland towns.
 */
export async function listBasesNearRoute(
  db: NodePgDatabase<typeof schema>,
  input: { stops: RouteStopPoint[]; maxKm: number; limit: number },
): Promise<BaseNearRoute[]> {
  if (input.stops.length === 0) return [];

  const stops = sql.join(
    input.stops.map(
      (stop, index) =>
        sql`(${index}::integer, ${stop.name}::text, ${doubleSql(stop.lat)}, ${doubleSql(stop.lng)})`,
    ),
    sql`, `,
  );
  const boxes = sql.join(
    input.stops.map((stop) =>
      boundingBoxSql(sql`b.lat`, sql`b.lng`, boundingBox(stop, input.maxKm)),
    ),
    sql` or `,
  );
  const distance = distanceKmSql(sql`s.lat`, sql`s.lng`, sql`b.lat`, sql`b.lng`);

  const rows = await db.execute<BaseNearRoute>(sql`
    with stop (idx, name, lat, lng) as (values ${stops}),
    candidate as (
      select b.id, near.idx, near.name, near.distance_km
      from base b
      cross join lateral (
        select s.idx, s.name, ${distance} as distance_km
        from stop s
        order by distance_km asc, s.idx asc
        limit 1
      ) near
      where b.lat is not null
        and b.lng is not null
        and (${boxes})
        and exists (select 1 from listing_search_doc doc where doc.base_id = b.id)
    ),
    nearest as (
      select id, idx, name, distance_km
      from candidate
      where distance_km <= ${doubleSql(input.maxKm)}
      order by distance_km asc, id asc
      limit ${input.limit}
    )
    ${describeNearest(sql`, n.name as "nearStop", n.idx as "nearStopIndex"`, sql`n.idx asc, n.distance_km asc, b.id asc`)}
  `);

  return rows.rows;
}
