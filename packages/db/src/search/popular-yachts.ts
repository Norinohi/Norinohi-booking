import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema/index";
import { normalizedKey, normalizedKeySql } from "./normalize";
import {
  normalizeSearchRow,
  recommendedSortValue,
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
};

export type PopularYachtsInput = {
  config: PopularYachtsConfig;
  /**
   * Rotates the selection. Deterministic on purpose: the home page read is cached, so a
   * `random()` in here would either be cached along with its one answer or break the prerender.
   * The caller buckets a clock into it -- a day, typically -- and the seed rides in the cache key.
   */
  seed: number;
};

type Candidate = SearchRow & { popularCategory: string | null };
/* The three window-function stages add a rank per boat type, which the mix is filled from. */
type RankedCandidate = Candidate & { typeRank: number };

/**
 * The slider's boats: well-rated, recent, available, and spread across the curated countries.
 *
 * The three caps -- one boat per base, `maxPerCountry` per country, then the per-type quota --
 * are a greedy constraint in the general case, but they are applied in a fixed order under one
 * global ordering, and that collapses them into stacked `row_number()` filters. Each stage sees
 * the survivors of the one above it in the same order, so the answer is the same as walking the
 * list and skipping, and unlike a recursive CTE it can be read.
 *
 * Only curated countries are considered. That is the client's rule and it is also what makes
 * the caps mean anything: "max two per country" over eighty countries would never bind.
 */
export async function listPopularYachts(
  db: NodePgDatabase<typeof schema>,
  input: PopularYachtsInput,
): Promise<ListingSearchDoc[]> {
  const { config, seed } = input;

  const rows = await db.execute<RankedCandidate>(sql`
    with candidate as (
      select doc.*, ${recommendedSortValue} as recommended
      from listing_search_doc doc
      join facet_media country
        on country.kind = 'country'
        and country.popular_rank is not null
        and ${normalizedKeySql(sql`country.value`)} = ${normalizedKeySql(sql`doc.country`)}
      /* Rating is not a filter here, only the first sort key. Reviews are thin on the newest
         hulls -- the catalogue has 196 rated boats and none of them is also under three years
         old -- so requiring one emptied the slider entirely. Unrated boats sort last instead,
         which is what "best rated first" means on a fleet that is mostly unrated. */
      where doc.bookable_from is not null
        and doc.available_to >= current_date
        and doc.year_built is not null
        and doc.year_built >= extract(year from current_date)::integer - ${config.maxAgeYears}
    ),
    ordered as (
      /* One global order every stage below reuses. The hash is what rotates the slider: it
         reshuffles boats the rating and the recommended score could not separate, and it is
         stable for a given seed so a cached page and a fresh one agree. */
      select
        candidate.*,
        row_number() over (
          order by
            candidate.rating desc,
            candidate.recommended desc,
            hashtext(candidate.listing_id || ${String(seed)}),
            candidate.listing_id
        ) as position
      from candidate
    ),
    per_base as (
      select ordered.*, row_number() over (partition by ordered.base_id order by position) as rn
      from ordered
    ),
    per_country as (
      select
        per_base.*,
        row_number() over (
          partition by ${normalizedKeySql(sql`per_base.country`)}
          order by position
        ) as country_rn
      from per_base
      where rn <= ${config.maxPerBase}
    ),
    per_type as (
      select
        per_country.*,
        row_number() over (
          partition by ${normalizedKeySql(sql`per_country.category`)}
          order by position
        ) as type_rn,
        ${normalizedKeySql(sql`per_country.category`)} as category_key
      from per_country
      where country_rn <= ${config.maxPerCountry}
    )
    select ${searchColumns}, doc.type_rn as "typeRank", doc.category_key as "popularCategory"
    from per_type doc
    order by doc.position
  `);

  return select(rows.rows, config);
}

/**
 * Fills the mix from the ordered survivors, then tops up to `limit` from what is left.
 *
 * Split out of the SQL because "take three catamarans, and if there are only two take another
 * sailing yacht instead" is a fallback rather than a filter, and expressing it as one would mean
 * a query that either refuses to fill the slider or silently changes what the quotas mean.
 */
function select(rows: RankedCandidate[], config: PopularYachtsConfig): ListingSearchDoc[] {
  const quota = new Map(
    Object.entries(config.mix).map(([category, count]) => [normalizedKey(category), count]),
  );

  const picked: typeof rows = [];
  const rest: typeof rows = [];

  for (const row of rows) {
    const allowed = quota.get(row.popularCategory ?? "");
    if (allowed !== undefined && row.typeRank <= allowed) picked.push(row);
    else rest.push(row);
  }

  /* Rows arrive in the global order and both halves preserve it, so the top-up continues the
     same ranking rather than restarting it. */
  const filled = [...picked, ...rest].slice(0, config.limit);
  return filled.map((row) => normalizeSearchRow(row));
}
