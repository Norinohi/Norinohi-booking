import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { DEFAULT_LOCALE, TRANSLATED_LOCALES } from "../locales";

import type * as schema from "../schema";
import { normalizedKey, normalizedKeySql } from "./normalize";
import type { FacetMediaKind, ListingSearchDoc } from "./types";

export { DEFAULT_LOCALE };

/**
 * Locales a provider-sourced label is worth storing for: every site locale but the default,
 * which lives on `facet_media.value` itself. Adding a language means re-running the facet
 * backfill so the labels providers already sent are stored for it.
 *
 * NauSYS ships eighteen languages per reference list. Storing only what the site serves
 * keeps the table proportional to the pages that exist.
 */
export const CONTENT_LOCALES = TRANSLATED_LOCALES;

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
      ${normalizedKeySql(sql`media.value`)} as key,
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
    baseName: baseLabel(translate, doc.baseName, doc.location),
    amenities: doc.amenities.map((amenity) => translate("equipment", amenity)),
    /* Kept beside the translated labels because curated rank, the amenity headings and the
       equipment filter are all keyed on the English value. See `amenityKeys` on the doc. */
    amenityKeys: doc.amenities,
    categoryKey: doc.category,
  }));
}

/**
 * A base's label, following its location's copy when the base is only named after it.
 *
 * NauSYS bases carry no name, so the projection copies the location in, and the two then took
 * separate translations: es kept the marina "Lavrion - Olympic Marine" untranslated beside the
 * location "Lavrion - Marina olímpica", and the address line printed the same place twice.
 */
export function baseLabel(translate: FacetTranslator, baseName: string, location: string): string {
  const own = translate("marina", baseName);
  if (own !== baseName || normalizedKey(baseName) !== normalizedKey(location)) return own;
  return translate("location", location);
}

/*
 * Re-exported rather than defined here: the fold moved to ./normalize once it had to reconcile
 * two vendors' accents as well as their punctuation, and every caller of this pair still reaches
 * it through the module that reads facet copy.
 */
export { normalizedKey, normalizedKeySql } from "./normalize";
