import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema/index";
import { normalizedKeySql } from "../search/normalize";

export type PopularRouteStop = {
  name: string;
  lat: number;
  lng: number;
  note: string | null;
};

export type PopularRoute = {
  id: string;
  title: string;
  description: string | null;
  nights: number;
  difficulty: "easy" | "moderate" | "advanced" | null;
  imageUrl: string | null;
  cloudinaryId: string | null;
  /** "Dalmatia · Croatia", the place a card names under its title. */
  placeLabel: string;
  /** The country a card's link filters the catalogue by, as a search filter value. */
  countryValue: string | null;
  /** The same country as the card names it, in the requested language where one exists. */
  countryLabel: string | null;
  /**
   * The sailing area a card's link filters the catalogue by, for a route drawn over a region. The
   * search filter matches it against the boats' region, so it is the English name, not a label.
   *
   * Null for a route that starts from a base. A base's region is whatever its vendor filed, and
   * Booking Manager files most of the Mediterranean as "Southern Europe": filtering Split's route
   * by that region kept one vendor's boats across three countries and dropped the other's.
   */
  sailingAreaValue: string | null;
  /** The base a card's link filters the catalogue by, for a route that starts from one. */
  marinaValue: string | null;
  stops: PopularRouteStop[];
};

/**
 * The site-wide popular sailing routes, in the curated order, in one language.
 *
 * Localized by an exact locale match with a fallback to the route's own columns, which is what
 * `facet_media_translation` does and what the FAQ read does not -- the FAQ drops an entry with
 * no copy in the asked-for language, but a slider that shows three cards in German and six in
 * English would read as a broken page rather than as a translation gap.
 *
 * Drafts are excluded. `active` is the flag that says a route has an itinerary, and a card
 * linking to an empty one is worse than a shorter slider.
 */
export async function listPopularRoutes(
  db: NodePgDatabase<typeof schema>,
  input: { locale?: string; limit?: number } = {},
): Promise<PopularRoute[]> {
  const locale = input.locale ?? "en";
  const limit = input.limit ?? 12;

  const rows = await db.execute<PopularRoute>(sql`
    select
      route.id,
      coalesce(nullif(trim(translation.title), ''), route.title) as title,
      coalesce(nullif(trim(translation.description), ''), route.description) as description,
      route.nights,
      route.difficulty,
      route.image_url as "imageUrl",
      route.cloudinary_id as "cloudinaryId",
      /* A route hangs off a base or a region and the two reach their country by different
         paths, so both are joined and coalesced rather than branched on in the caller. */
      concat_ws(
        ' · ',
        coalesce(base.name, target_region.name),
        coalesce(base_region.name, target_region.name),
        coalesce(base_country.name, region_country.name)
      ) as "placeLabel",
      coalesce(base_country.name, region_country.name) as "countryValue",
      target_region.name as "sailingAreaValue",
      base.name as "marinaValue",
      coalesce(
        (
          select nullif(trim(country_translation.label), '')
          from facet_media country_media
          join facet_media_translation country_translation
            on country_translation.facet_media_id = country_media.id
            and country_translation.locale = ${locale}
          where country_media.kind = 'country'
            and ${normalizedKeySql(sql`country_media.value`)}
              = ${normalizedKeySql(sql`coalesce(base_country.name, region_country.name)`)}
          limit 1
        ),
        coalesce(base_country.name, region_country.name)
      ) as "countryLabel",
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', stop.name,
              'lat', stop.lat,
              'lng', stop.lng,
              /* Same fallback the route's own copy takes: the locale's note, else what the stop
                 was written with. */
              'note', coalesce(
                nullif(trim((
                  select stop_translation.note
                  from suggested_route_stop_translation stop_translation
                  where stop_translation.stop_id = stop.id and stop_translation.locale = ${locale}
                )), ''),
                stop.note
              )
            )
            order by stop.sort_order
          )
          from suggested_route_stop stop
          where stop.route_id = route.id
        ),
        '[]'::jsonb
      ) as stops
    from suggested_route route
    left join suggested_route_translation translation
      on translation.route_id = route.id and translation.locale = ${locale}
    left join base on base.id = route.base_id
    left join location on location.id = base.location_id
    left join region base_region on base_region.id = location.region_id
    left join country base_country on base_country.id = base_region.country_id
    left join region target_region on target_region.id = route.region_id
    left join country region_country on region_country.id = target_region.country_id
    where route.featured_rank is not null and route.active
    order by route.featured_rank asc
    limit ${limit}
  `);

  return rows.rows;
}
