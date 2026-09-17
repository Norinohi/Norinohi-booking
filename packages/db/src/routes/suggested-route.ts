import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import type { SuggestedRoute } from "./types";

/**
 * The itinerary written for this listing's charter base, or for its sailing region.
 *
 * Nothing is composed here. A route exists because somebody wrote it, and where nobody has this
 * returns null and the section does not render - which replaces a generated 7-day plan whose
 * stops were the marina shifted by a fixed offset (docs/generated-content-audit.md §1).
 *
 * A route attached to the base wins over one attached to its region, then `sort_order`. Joining
 * the stops rather than fetching them separately also drops a route that has none, which has no
 * itinerary to show.
 */
export async function suggestedRouteFor(
  db: NodePgDatabase<typeof schema>,
  baseId: string,
  locale: string,
): Promise<SuggestedRoute | null> {
  const rows = await db.execute<{
    title: string;
    description: string | null;
    name: string;
    note: string | null;
    lat: number;
    lng: number;
    sortOrder: number;
    baseName: string | null;
    baseLat: number | null;
    baseLng: number | null;
  }>(sql`
    with picked as (
      select r.id, r.title, r.description
      from suggested_route r
      where r.active
        and (
          r.base_id = ${baseId}
          or r.region_id = (
            select l.region_id
            from base b
            join location l on l.id = b.location_id
            where b.id = ${baseId}
          )
        )
      order by (r.base_id is null), r.sort_order asc, r.created_at asc
      limit 1
    )
    /* The route's copy in the page's language where an editor wrote one, its own columns
       otherwise -- the same fallback the home page's popular-routes read uses. */
    select
      coalesce(nullif(trim(t.title), ''), p.title) as title,
      coalesce(nullif(trim(t.description), ''), p.description) as description,
      s.name, s.lat, s.lng, s.sort_order as "sortOrder",
      coalesce(nullif(trim(st.note), ''), s.note) as note,
      /* The yacht's own base, which the first and last day are rewritten to below. */
      home.name as "baseName", home.lat as "baseLat", home.lng as "baseLng"
    from picked p
    left join suggested_route_translation t on t.route_id = p.id and t.locale = ${locale}
    join suggested_route_stop s on s.route_id = p.id
    left join suggested_route_stop_translation st on st.stop_id = s.id and st.locale = ${locale}
    left join base home on home.id = ${baseId}
    order by s.sort_order asc
  `);

  const first = rows.rows[0];
  if (!first) return null;

  const last = rows.rows.length - 1;
  /*
   * A route is written from the town it sails out of, and a listing is chartered from one marina
   * in that town: the author's "Split" is this yacht's ACI Marina Split, three kilometres from the
   * point the file carries. The itinerary in between is indicative and stays as written -- but the
   * two days the visitor can actually check are the first and the last, and those are the base's.
   *
   * Only where the route comes back to where it started, which is every one the client wrote: a
   * one-way delivery route would have its finish moved to the wrong end of the coast.
   */
  const roundTrip = last > 0 && first.name === rows.rows[last]?.name;
  const home =
    roundTrip && first.baseName && first.baseLat !== null && first.baseLng !== null
      ? { name: first.baseName, lat: first.baseLat, lng: first.baseLng }
      : null;

  return {
    title: first.title,
    description: first.description,
    stops: rows.rows.map((stop, index) => {
      const atBase = home && (index === 0 || index === last);
      return {
        day: index + 1,
        name: atBase ? home.name : stop.name,
        note: stop.note,
        lat: atBase ? home.lat : stop.lat,
        lng: atBase ? home.lng : stop.lng,
      };
    }),
  };
}
