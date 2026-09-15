import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";

import type * as schema from "../schema/index";
import { localizeSearchDocs } from "./localize";
import { normalizedKey, normalizedKeySql } from "./normalize";
import {
  normalizeSearchRow,
  recommendedSortValue,
  nextCharterAfterLapseColumns,
  searchColumns,
  type SearchRow,
} from "./repository";
import type { ListingSearchDoc } from "./types";

/**
 * How the home page's "Popular yachts" slider is composed.
 *
 * `mix` is a target rather than a guarantee: the caps below it can starve a category, and a
 * slider that came back three boats short because no motor catamaran survived the country cap
 * would be worse than one topped up from the rest of the pool. `listPopularYachts` says which
 * happened by returning `limit` boats either way.
 */
export type PopularYachtsConfig = {
  limit: number;
  /** A boat older than this many years is not offered, however well it is rated. */
  maxAgeYears: number;
  maxPerCountry: number;
  maxPerBase: number;
  /** Target count per boat type, keyed by the marketplace category's filter value. */
  mix: Record<string, number>;
  /**
   * The countries the slider draws from, each optionally narrowed to named places. Empty falls
   * back to the countries pinned in the search filter.
   */
  destinations: PopularDestination[];
};

/**
 * A country and the places in it a boat may sail from.
 *
 * A place is written the way the client wrote it, "Split / Trogir": the slashes separate
 * spellings of one place, any of which may appear in the boat's marina, location, city or region.
 * Neither vendor has a field that holds a cruising area at that grain -- region is "Southern
 * Europe" for most of Booking Manager, city is empty for most of both -- so a match on the
 * words is the one thing that reaches every boat. No places means the whole country.
 *
 * With places named, each place counts as one base for `maxPerBase`: the client's "one boat from
 * one base" means one from Split, not one from each of Split's marinas.
 */
export type PopularDestination = {
  country: string;
  places: string[];
};

export type PopularYachtsInput = {
  config: PopularYachtsConfig;
  /**
   * Rotates the selection. Deterministic on purpose: the home page read is cached, so a
   * `random()` in here would either be cached along with its one answer or break the prerender.
   * The caller buckets a clock into it -- a day, typically -- and the seed rides in the cache key.
   */
  seed: number;
  locale?: string;
};

type Candidate = SearchRow & { baseKey: string; countryKey: string; categoryKey: string };

/**
 * The slider's boats: well-rated, recent, available, and spread across the curated destinations.
 *
 * SQL narrows and orders the pool; the caps are applied by `pickPopular` in one walk over it.
 * They used to be stacked `row_number()` filters -- base, then country, then type -- and that
 * order starved every type a country had to share: Croatia's two places went to its two best
 * sailing yachts before the type quota was ever consulted, so the only motor boats in the pool
 * never made the slider although their quota stood empty.
 *
 * Only the configured destinations are considered, or the pinned countries when none are. That
 * is the client's rule and it is also what makes the caps mean anything: "max two per country"
 * over eighty countries would never bind.
 */
export async function listPopularYachts(
  db: NodePgDatabase<typeof schema>,
  input: PopularYachtsInput,
): Promise<ListingSearchDoc[]> {
  const { config, seed } = input;

  const rows = await db.execute<Candidate>(sql`
    with candidate as (
      select distinct on (doc.listing_id)
        doc.*,
        ${recommendedSortValue} as recommended,
        coalesce(destination.place_key, doc.base_id) as base_key
      ${candidateSource(config.destinations)}
      /* Rating is not a filter here, only the first sort key. Reviews are thin on the newest
         hulls -- the catalogue has 196 rated boats and none of them is also under three years
         old -- so requiring one emptied the slider entirely. Unrated boats sort last instead,
         which is what "best rated first" means on a fleet that is mostly unrated. */
      where doc.bookable_from is not null
        and doc.available_to >= current_date
        and doc.year_built is not null
        and doc.year_built >= extract(year from current_date)::integer - ${config.maxAgeYears}
      /* A boat matching two places belongs to the one listed first. */
      order by doc.listing_id, destination.ordinal
    )
    select
      ${searchColumns}${nextCharterAfterLapseColumns()},
      doc.base_key as "baseKey",
      ${normalizedKeySql(sql`doc.country`)} as "countryKey",
      ${normalizedKeySql(sql`doc.category`)} as "categoryKey"
    from candidate doc
    /* The hash is what rotates the slider: it reshuffles boats the rating and the recommended
       score could not separate, and it is stable for a given seed so a cached page and a fresh
       one agree. */
    order by
      doc.rating desc,
      doc.recommended desc,
      hashtext(doc.listing_id || ${String(seed)}),
      doc.listing_id
  `);

  const picked = pickPopular(rows.rows, config).map((row) => normalizeSearchRow(row));
  return localizeSearchDocs(db, picked, input.locale);
}

/**
 * The boats joined to the destination each one sails from, as `doc` and `destination`.
 *
 * Both branches give `destination` the same `ordinal` and `place_key`, so the query above does
 * not care which one ran. The configured list is inlined as `values` rather than stored in a
 * table of its own: it is a couple of dozen rows, and Postgres refuses an empty `values`, which is
 * why no destinations takes the pinned-country branch instead of an empty join.
 */
function candidateSource(destinations: PopularDestination[]): SQL {
  const rows = destinationRows(destinations);

  if (rows.length === 0) {
    return sql`
      from listing_search_doc doc
      join (
        select value, popular_rank as ordinal, null::text as place_key
        from facet_media
        where kind = 'country' and popular_rank is not null
      ) destination
        on ${normalizedKeySql(sql`destination.value`)} = ${normalizedKeySql(sql`doc.country`)}`;
  }

  const values = sql.join(
    rows.map(
      (row) =>
        sql`(${row.countryKey}::text, ${row.placeKey}::text, ${row.term}::text, ${row.ordinal}::integer)`,
    ),
    sql`, `,
  );

  return sql`
    from listing_search_doc doc
    join (values ${values}) as destination(country_key, place_key, term, ordinal)
      on destination.country_key = ${normalizedKeySql(sql`doc.country`)}
      and (
        destination.term is null
        or position(
          destination.term in ${normalizedKeySql(
            sql`concat_ws(' ', doc.base_name, doc.location, doc.city, doc.region)`,
          )}
        ) > 0
      )`;
}

type DestinationRow = {
  countryKey: string;
  placeKey: string | null;
  term: string | null;
  ordinal: number;
};

/** One row per spelling of every place, or one per country where it names no places. */
function destinationRows(destinations: PopularDestination[]): DestinationRow[] {
  const rows: DestinationRow[] = [];

  for (const destination of destinations) {
    const countryKey = normalizedKey(destination.country);
    if (!countryKey) continue;

    const places = destination.places
      .map((place) => ({
        placeKey: `${countryKey}:${normalizedKey(place)}`,
        terms: place.split("/").map(normalizedKey).filter(Boolean),
      }))
      .filter((place) => place.terms.length > 0);

    if (places.length === 0) {
      rows.push({ countryKey, placeKey: null, term: null, ordinal: rows.length });
      continue;
    }

    for (const place of places) {
      for (const term of place.terms) {
        rows.push({ countryKey, placeKey: place.placeKey, term, ordinal: rows.length });
      }
    }
  }

  return rows;
}

export type PopularCandidate = { baseKey: string; countryKey: string; categoryKey: string };

/**
 * Fills the mix from the ordered pool, then tops up to `limit` from what is left.
 *
 * Both passes take the next boat in the global order that the base and country caps still
 * admit, so a boat is only ever passed over for a cap it would actually break. The mix pass also
 * wants a type with quota left; the top-up does not, because a slider three boats short for want
 * of a motor catamaran is worse than one with an extra sailing yacht. Picks are returned mix
 * first, each pass in ranking order.
 *
 * Greedy rather than optimal: an early pick can use up a country another type needed. On a pool
 * ordered by rating that is the answer the client's rule describes -- best boats first, within
 * the caps -- and it is one walk over a few hundred rows.
 */
export function pickPopular<T extends PopularCandidate>(
  rows: readonly T[],
  config: Pick<PopularYachtsConfig, "limit" | "maxPerBase" | "maxPerCountry" | "mix">,
): T[] {
  const quota = new Map(
    Object.entries(config.mix).map(([category, count]) => [normalizedKey(category), count]),
  );
  const perBase = new Map<string, number>();
  const perCountry = new Map<string, number>();
  const picked = new Set<T>();

  const admits = (row: T) =>
    (perBase.get(row.baseKey) ?? 0) < config.maxPerBase &&
    (perCountry.get(row.countryKey) ?? 0) < config.maxPerCountry;

  const take = (row: T) => {
    picked.add(row);
    perBase.set(row.baseKey, (perBase.get(row.baseKey) ?? 0) + 1);
    perCountry.set(row.countryKey, (perCountry.get(row.countryKey) ?? 0) + 1);
  };

  for (const row of rows) {
    if (picked.size >= config.limit) break;
    const left = quota.get(row.categoryKey) ?? 0;
    if (left <= 0 || !admits(row)) continue;
    quota.set(row.categoryKey, left - 1);
    take(row);
  }

  for (const row of rows) {
    if (picked.size >= config.limit) break;
    if (!picked.has(row) && admits(row)) take(row);
  }

  return [...picked];
}
