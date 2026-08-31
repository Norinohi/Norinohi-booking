import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import type { FacetMediaKind, ListingSearchDoc } from "./types";

export const DEFAULT_LOCALE = "en";

/**
 * Locales a provider-sourced label is worth storing for.
 *
 * Mirrors `locales` in apps/web/src/i18n/config.ts minus the default, which lives on
 * `facet_media.value` itself. Kept here rather than imported because the sync writer runs
 * in packages/providers, which has no route into the web app; adding a language means
 * editing both and re-running the facet backfill.
 *
 * NauSYS ships eighteen languages per reference list. Storing only what the site serves
 * keeps the table proportional to the pages that exist.
 */
export const CONTENT_LOCALES = ["es", "uk", "de"] as const;

/*
 * Which facet_media kind carries the translation for each card label.
 *
 * Cards and filter chips show the same words, so both read the same table: a card
 * that says "Катамаран" next to a filter that says "Catamaran" is the failure this
 * mapping avoids. Only display labels are swapped — the search filters compare
 * against doc.category / doc.country in the database, which stay English.
 */
const TRANSLATED_KINDS = [
  "country",
  "region",
  "location",
  "marina",
  "category",
  "crew",
  "sail_type",
  "equipment",
] as const satisfies readonly FacetMediaKind[];

type TranslationRow = { kind: string; key: string; label: string };

/**
 * Swaps the display labels on search rows for their `locale` copy.
 *
 * A missing translation leaves the English label in place, so a half-translated
 * locale degrades word by word rather than blanking a card.
 */
/**
 * `(kind, value) → label` for one locale, or undefined when nothing is translated.
 *
 * Shared by the card localizer and the catalogue-page enumeration: both name the same countries,
 * regions, marinas and categories, and a page headed "Yacht Charter in Croatia" above cards that
 * say "Хорватія" is the drift this avoids.
 */
export type FacetTranslator = (kind: FacetMediaKind, value: string) => string;

export async function facetTranslator(
  db: NodePgDatabase<typeof schema>,
  locale: string | undefined,
): Promise<FacetTranslator | undefined> {
  if (!locale || locale === DEFAULT_LOCALE) return undefined;

  const rows = await db.execute<TranslationRow>(sql`
    select
      media.kind as kind,
      regexp_replace(replace(lower(coalesce(media.value, '')), '&', 'and'), '[^a-z0-9]+', '', 'g') as key,
      translation.label as label
    from facet_media media
    join facet_media_translation translation
      on translation.facet_media_id = media.id
      and translation.locale = ${locale}
    where translation.label is not null
      and media.kind in (${sql.join(
        TRANSLATED_KINDS.map((kind) => sql`${kind}`),
        sql`, `,
      )})
  `);
  if (rows.rows.length === 0) return undefined;

  const byKindValue = new Map(rows.rows.map((row) => [`${row.kind}:${row.key}`, row.label]));
  return (kind, value) => byKindValue.get(`${kind}:${normalizedKey(value)}`) ?? value;
}

/**
 * Swaps the display labels on search rows for their `locale` copy.
 *
 * A missing translation leaves the English label in place, so a half-translated
 * locale degrades word by word rather than blanking a card.
 */
export async function localizeSearchDocs<T extends ListingSearchDoc>(
  db: NodePgDatabase<typeof schema>,
  docs: T[],
  locale: string | undefined,
  /* Callers that translate something else off the same locale pass their translator in
     rather than paying for a second copy of the table. */
  translator?: FacetTranslator,
): Promise<T[]> {
  if (docs.length === 0) return docs;

  const translate = translator ?? (await facetTranslator(db, locale));
  if (!translate) return docs;

  /* Nullable columns keep their null: an absent label has nothing to translate. */
  const translateOptional = (kind: FacetMediaKind, value: string | null): string | null =>
    value === null ? null : translate(kind, value);

  return docs.map((doc) => ({
    ...doc,
    category: translateOptional("category", doc.category),
    crewType: translateOptional("crew", doc.crewType),
    sailType: translateOptional("sail_type", doc.sailType),
    country: translate("country", doc.country),
    region: translate("region", doc.region),
    location: translate("location", doc.location),
    baseName: translate("marina", doc.baseName),
    amenities: doc.amenities.map((amenity) => translate("equipment", amenity)),
  }));
}

/**
 * Mirrors normalizedSql in repository.ts, so "Sailing yacht" and "sailing-yacht" match.
 *
 * Exported because the catalogue sync writes `facet_media.value` and has to fold two
 * spellings of one label into one row; the query above folds the same way, and a writer
 * normalizing differently would insert rows this join can never reach.
 */
export function normalizedKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * `normalizedKey` as SQL, for the reads that have to fold a name they never loaded.
 *
 * Lives here so the two cannot drift: a writer folding one way and a read join folding the
 * other produces rows the join can never reach, which is the failure this pairing exists to
 * prevent.
 */
export function normalizedKeySql(column: SQL): SQL {
  return sql`regexp_replace(replace(lower(coalesce(${column}, '')), '&', 'and'), '[^a-z0-9]+', '', 'g')`;
}
