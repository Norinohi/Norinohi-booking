import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema/index";
import { valueForLabel } from "../search/filters";
import { normalizedKey, normalizedKeySql } from "../search/normalize";

export type PopularRouteStop = {
  name: string;
  lat: number;
  lng: number;
  note: string | null;
};

export type PopularRoute = {
  id: string;
  /** The route's public address, `/routes/<slug>`. */
  slug: string;
  title: string;
  description: string | null;
  nights: number;
  kind: "seven_days" | "fourteen_days" | "family" | "first_time_sailors" | "active_sailing";
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
   * search filter matches it against the boats' region, so it is the English name's filter value
   * (`split-region`), not a translated label.
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

type PopularRouteRow = Omit<PopularRoute, "placeLabel"> & { placeLabel: (string | null)[] };

/*
 * Base, region and country, each once. A region-drawn route has no base, and a territory such as
 * the British Virgin Islands files the same name as its region and its country, so the plain join
 * read "British Virgin Islands · British Virgin Islands · British Virgin Islands".
 */
export function placeLabel(parts: (string | null)[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const name = part?.trim();
    if (!name) continue;
    const key = normalizedKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept.join(" · ");
}

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
  input: {
    locale?: string;
    limit?: number;
    /** Keep routes in this country, matched on the folded English name. */
    country?: string;
    /** Keep routes in this sailing region, whether drawn over it or starting from a base in it. */
    region?: string;
    /**
     * Every published route rather than only the curated list. The routes map shows them all; the
     * featured ones still come first, in their curated order.
     */
    includeUnfeatured?: boolean;
  } = {},
): Promise<PopularRoute[]> {
  const locale = input.locale ?? "en";
  const limit = input.limit ?? 12;
  const countryFilter = input.country
    ? sql`and ${normalizedKeySql(sql`coalesce(base_country.name, region_country.name)`)} = ${normalizedKey(input.country)}`
    : sql``;
  const featuredFilter = input.includeUnfeatured ? sql`` : sql`and route.featured_rank is not null`;
  const regionFilter = input.region
    ? sql`and ${normalizedKeySql(sql`coalesce(target_region.name, base_region.name)`)} = ${normalizedKey(input.region)}`
    : sql``;

  const rows = await db.execute<PopularRouteRow>(sql`
    select
      route.id,
      route.slug,
      coalesce(nullif(trim(translation.title), ''), route.title) as title,
      coalesce(nullif(trim(translation.description), ''), route.description) as description,
      route.nights,
      route.kind,
      route.difficulty,
      route.image_url as "imageUrl",
      route.cloudinary_id as "cloudinaryId",
      /* A route hangs off a base or a region and the two reach their country by different
         paths, so both are joined and coalesced rather than branched on in the caller. */
      jsonb_build_array(
        base.name,
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
    where route.active
      ${featuredFilter}
      ${countryFilter}
      ${regionFilter}
    order by route.featured_rank asc nulls last, route.sort_order asc, route.id asc
    limit ${limit}
  `);

  /*
   * Filter values in the same slug form the filter controls select by. The bare names reached the
   * URL as `country=Croatia&sailingArea=Split+region`: the search matched them all the same, but
   * the chips look options up by value, found none, and printed "Country: Croatia" on a Ukrainian
   * page.
   */
  const asValue = (name: string | null) => (name === null ? null : valueForLabel(name));
  return rows.rows.map((row) => ({
    ...row,
    placeLabel: placeLabel(row.placeLabel),
    countryValue: asValue(row.countryValue),
    sailingAreaValue: asValue(row.sailingAreaValue),
    marinaValue: asValue(row.marinaValue),
  }));
}

/**
 * The places "the marinas near this route" are measured from: every stop of a published route in
 * itinerary order, or its base alone for a route written before it had stops. Null for a draft or
 * an unknown id, and an empty list for a route with neither.
 */
export async function findRoutePlaces(
  db: NodePgDatabase<typeof schema>,
  routeId: string,
): Promise<{ name: string; lat: number; lng: number }[] | null> {
  const routes = await db.execute<{ name: string | null; lat: number | null; lng: number | null }>(
    sql`
      select base.name, base.lat, base.lng
      from suggested_route route
      left join base on base.id = route.base_id
      where route.id = ${routeId} and route.active
    `,
  );
  const [route] = routes.rows;
  if (!route) return null;

  const stops = await db.execute<{ name: string; lat: number; lng: number }>(sql`
    select name, lat, lng
    from suggested_route_stop
    where route_id = ${routeId}
    order by sort_order
  `);
  if (stops.rows.length > 0) return stops.rows;
  return route.name !== null && route.lat !== null && route.lng !== null
    ? [{ name: route.name, lat: route.lat, lng: route.lng }]
    : [];
}
