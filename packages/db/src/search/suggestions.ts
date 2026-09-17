import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { valueForLabel } from "./filters";
import { facetTranslator } from "./localize";
import { normalizedKey, normalizedKeySql, placeWordsKeySql } from "./normalize";
import { hasCyrillic, phoneticKey, phoneticKeySql } from "./phonetic-key";
import type { FacetMediaKind, ListingSuggestion } from "./types";

/*
 * How many countries the empty typeahead offers. Eight rather than the five it used to show,
 * because that is the length of the curated list it now leads with.
 */
const POPULAR_SUGGESTION_LIMIT = 8;

const SUGGESTION_LIMIT = 10;

type SuggestionKind = ListingSuggestion["kind"];

/*
 * Each kind is the column its search filter reads, so a picked suggestion always finds the boats
 * it was counted from. `city` reads `doc.city`, the town a base is mapped to, and not
 * `doc.location`, the vendor's own place name: offered from the location column, "Split" set a
 * city filter no boat carried and answered with nothing.
 */
const COLUMN_OF = {
  country: sql`doc.country`,
  region: sql`doc.region`,
  city: sql`doc.city`,
  base: sql`doc.base_name`,
} satisfies Record<SuggestionKind, SQL>;

/* The facet_media kind a label is translated under. A town has none, so it keeps its spelling. */
const TRANSLATED_AS = {
  country: "country",
  region: "region",
  city: null,
  base: "marina",
} satisfies Record<SuggestionKind, FacetMediaKind | null>;

/* Broadest first, so a region is not pushed off the list by the marinas named after its town. */
const KIND_ORDER: readonly SuggestionKind[] = ["country", "region", "city", "base"];

type SuggestionRow = { label: string; kind: SuggestionKind; popular?: boolean };

export async function listSearchSuggestions(
  db: NodePgDatabase<typeof schema>,
  query: string,
  locale?: string,
): Promise<ListingSuggestion[]> {
  const translate = await facetTranslator(db, locale);
  const localized = (row: SuggestionRow): ListingSuggestion => {
    const kind = TRANSLATED_AS[row.kind];
    return {
      ...row,
      label: translate && kind ? translate(kind, row.label) : row.label,
      value: valueForLabel(row.label),
    };
  };

  /*
   * Empty field: seed the typeahead with the popular countries so the user has somewhere to
   * start, instead of an alphabetical slice that means nothing.
   *
   * Curated order first, then the most-stocked, and the fallback is the point of the join being
   * a left one: until somebody opens the admin screen no country carries a rank, and this
   * answers exactly what it always did. Grouped off listing_search_doc either way, so a curated
   * country with nothing in stock is not offered.
   */
  if (query.trim() === "") {
    const popular = await db.execute<SuggestionRow>(sql`
      select
        doc.country as label,
        'country' as kind,
        bool_or(media.popular_rank is not null) as popular
      from listing_search_doc doc
      left join facet_media media
        on media.kind = 'country'
        and ${normalizedKeySql(sql`media.value`)} = ${normalizedKeySql(sql`doc.country`)}
        and media.popular_rank is not null
      where doc.country is not null
      group by doc.country
      order by min(media.popular_rank) asc nulls last, count(*) desc, doc.country asc
      limit ${POPULAR_SUGGESTION_LIMIT}
    `);
    return popular.rows.map(localized);
  }

  const pattern = `%${query.trim()}%`;
  const folded = normalizedKey(query);
  /* Cities and marinas have no translations, so a Cyrillic query is matched by sound instead. */
  const phonetic = hasCyrillic(query) ? phoneticKey(query) : "";
  const localizedKeys = await translatedMatches(db, pattern);

  /*
   * One pass over the documents, counted per place, and the fold run over those few thousand
   * rows rather than over every document once per kind.
   */
  const matches = KIND_ORDER.map((kind) => {
    const column = COLUMN_OF[kind];
    const mediaKind = TRANSLATED_AS[kind];
    const keys = mediaKind ? localizedKeys.get(mediaKind) : undefined;
    return sql`
      select ${kind}::text as kind, min(${column}) as label, sum(doc.boats)::integer as boats
      from places doc
      where ${column} is not null
        and (
          ${column} ilike ${pattern}
          ${folded ? sql`or ${normalizedKeySql(column)} like ${`%${folded}%`}` : sql``}
          ${phonetic ? sql`or ${phoneticKeySql(column)} like ${`%${phonetic}%`}` : sql``}
          ${
            keys?.length
              ? sql`or ${normalizedKeySql(column)} in (${sql.join(
                  keys.map((key) => sql`${key}`),
                  sql`, `,
                )})`
              : sql``
          }
        )
      group by ${kind === "base" ? sql`doc.country, ${placeWordsKeySql(column)}` : normalizedKeySql(column)}`;
  });

  const rows = await db.execute<SuggestionRow & { boats: number }>(sql`
    with places as materialized (
      select doc.country, doc.region, doc.city, doc.base_name, count(*) as boats
      from listing_search_doc doc
      group by doc.country, doc.region, doc.city, doc.base_name
    )
    select kind, label
    from (${sql.join(matches, sql` union all `)}) suggestions
    order by
      array_position(array[${sql.join(
        KIND_ORDER.map((kind) => sql`${kind}`),
        sql`, `,
      )}]::text[], kind),
      boats desc,
      label asc
    limit ${SUGGESTION_LIMIT}
  `);

  return rows.rows.map(localized);
}

/*
 * The folded values whose translated label contains the query, per facet kind, so "Спліт" finds
 * "Split region" whichever site it is typed on.
 */
async function translatedMatches(
  db: NodePgDatabase<typeof schema>,
  pattern: string,
): Promise<Map<FacetMediaKind, string[]>> {
  const kinds = Object.values(TRANSLATED_AS).filter((kind) => kind !== null);
  const byKind = new Map<FacetMediaKind, string[]>();

  /*
   * Every locale's labels, not only the page's: "Хорватія" typed on the English site is still
   * Croatia, and the default locale has no translations of its own to look in.
   */
  const rows = await db.execute<{ kind: FacetMediaKind; key: string }>(sql`
    select distinct media.kind, ${normalizedKeySql(sql`media.value`)} as key
    from facet_media media
    join facet_media_translation translation
      on translation.facet_media_id = media.id
    where translation.label ilike ${pattern}
      and media.kind in (${sql.join(
        kinds.map((kind) => sql`${kind}`),
        sql`, `,
      )})
  `);
  for (const row of rows.rows) {
    byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row.key]);
  }
  return byKind;
}
