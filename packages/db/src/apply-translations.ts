/**
 * Writes the generated label sets into the two translation tables.
 *
 * Ukrainian and Danish are the locales no provider supplies. NauSYS names its reference lists in
 * eighteen languages and none of them is it, so where German and Spanish are sourced and
 * refreshed on every sync, these labels are produced once and reviewed. `translations/uk.json`
 * is that review surface: it is checked in, diffs a word at a time, and this only ever writes
 * what that file says.
 *
 * Rows land as `source = 'generated'`, which is what keeps three writers out of each other's
 * way: the catalogue sync touches only `provider` rows, the seeded editorial copy is never
 * overwritten by either, and re-running this refreshes its own rows, plus any vendor row whose
 * "translation" is only the English value again, which it takes over.
 *
 *   pnpm --filter @yacht-charter/db translations:apply
 *   pnpm --filter @yacht-charter/db translations:apply -- --apply
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./index";
import { normalizedKey } from "./search/normalize";
import { extraLabels } from "./translations/extra-labels";
import { facetLabels } from "./translations/facet-labels";
import { generatedTranslations } from "./translations/generated";
import { facetMedia, facetMediaKind, facetMediaTranslation } from "./schema/facet-media";
import {
  extraLabelTranslation,
  providerExtraKind,
  providerExtraTranslation,
} from "./schema/listing-source";

/** Rows per insert, well inside the 65,535 parameters Postgres will bind at five per row. */
const CURATED_BATCH = 5_000;

/**
 * The checked-in file is edited by hand, so its kinds are parsed rather than trusted.
 *
 * A kind that is not a column value fails here, naming the key, instead of reaching Postgres
 * as an invalid enum literal three hundred rows into a batch insert.
 */
const labelsSchema = z.record(z.string().min(1), z.string().min(1));

const translationsSchema = z.object({
  /* Partial on purpose: `marina`, `crew`, `sail_type` and `location` are translatable kinds
     this file deliberately says nothing about. */
  facets: z.partialRecord(z.enum(facetMediaKind.enumValues), labelsSchema),
  extras: z.record(z.string().min(1), z.record(z.string().min(1), z.string().min(1))),
});

const facetLabelsSchema = z.partialRecord(
  z.enum(facetMediaKind.enumValues),
  z.record(z.string().min(1), labelsSchema),
);

const extraKeySchema = z
  .string()
  .transform((key) => key.split(":"))
  .pipe(z.tuple([z.enum(providerExtraKind.enumValues), z.string().min(1)]));

const generated = z.record(z.string().min(2), translationsSchema).parse(generatedTranslations);

type FacetKindValue = (typeof facetMediaKind.enumValues)[number];

const curatedFacets = facetLabelsSchema.parse(facetLabels);

/**
 * Facet rows for everything this file names, creating the ones the sync has not.
 *
 * The sync only creates a `facet_media` row for a value the provider translated, so Booking
 * Manager's vocabulary has none at all and `sail_type` has none from either provider. Naming a
 * value here is the only way those become translatable, so a missing row is created rather
 * than skipped. The count is printed: a spelling mistake in the file shows up as a facet
 * created where none was expected, which is the failure this would otherwise hide.
 */
/**
 * Both facet sources as one `value -> locale -> label` map for a kind.
 *
 * `translations/<locale>.json` is a per-locale set produced for the vocabulary providers do name in
 * their own languages; `translations/facet-labels.json` names the handful they never do, in all
 * three. Nothing appears in both, and if something ever does, the multi-locale file wins,
 * because it is the one that can answer for every locale.
 */
function mergedFacetLabels(kind: FacetKindValue) {
  const merged = new Map<string, Record<string, string>>();

  for (const [locale, translations] of Object.entries(generated)) {
    for (const [value, label] of Object.entries(translations.facets[kind] ?? {})) {
      merged.set(value, { ...merged.get(value), [locale]: label });
    }
  }
  for (const [value, byLocale] of Object.entries(curatedFacets[kind] ?? {})) {
    merged.set(value, { ...merged.get(value), ...byLocale });
  }

  return merged;
}

async function facetRows(apply: boolean): Promise<{
  rows: (typeof facetMediaTranslation.$inferInsert)[];
  created: number;
}> {
  const rows: (typeof facetMediaTranslation.$inferInsert)[] = [];
  let created = 0;

  for (const kind of facetMediaKind.enumValues) {
    const labels = mergedFacetLabels(kind);
    const values = [...labels.keys()];
    if (values.length === 0) continue;

    if (apply) {
      const inserted = await db
        .insert(facetMedia)
        .values(values.map((value) => ({ kind, value })))
        .onConflictDoNothing({ target: [facetMedia.kind, facetMedia.value] })
        .returning({ id: facetMedia.id });
      created += inserted.length;
    }

    const found = await db
      .select({ id: facetMedia.id, value: facetMedia.value })
      .from(facetMedia)
      .where(and(eq(facetMedia.kind, kind), inArray(facetMedia.value, values)));
    const idByValue = new Map(found.map((row) => [row.value, row.id]));

    for (const [value, byLocale] of labels) {
      const facetMediaId = idByValue.get(value);
      if (!facetMediaId) continue;
      for (const [locale, label] of Object.entries(byLocale)) {
        rows.push({ facetMediaId, locale, label, source: "generated" });
      }
    }
  }

  return { rows, created };
}

async function extraRows(): Promise<(typeof providerExtraTranslation.$inferInsert)[]> {
  const rows: (typeof providerExtraTranslation.$inferInsert)[] = [];

  for (const [locale, translations] of Object.entries(generated)) {
    for (const [source, labels] of Object.entries(translations.extras)) {
      for (const [key, label] of Object.entries(labels)) {
        const [kind, externalId] = extraKeySchema.parse(key);
        rows.push({ source, kind, externalId, locale, label });
      }
    }
  }

  return rows;
}

/**
 * Mirrors extraNameKeySql in search/repository.ts, which is what the read join folds with.
 * The two have to agree exactly or a curated label is written somewhere nothing reads it.
 */
const extraNameKey = normalizedKey;

function curatedRows(): (typeof extraLabelTranslation.$inferInsert)[] {
  const byKey = new Map<string, typeof extraLabelTranslation.$inferInsert>();

  for (const [name, byLocale] of Object.entries(extraLabels)) {
    for (const [locale, label] of Object.entries(byLocale)) {
      const nameKey = extraNameKey(name);
      const seen = byKey.get(`${nameKey}:${locale}`);
      /* Two spellings of one fee fold to one row, which is the point - but only when they
         agree. Postgres would otherwise reject the whole batch with "cannot affect row a
         second time", naming neither entry. */
      if (seen && seen.label !== label) {
        throw new Error(
          `"${name}" and "${seen.name}" are the same key but disagree in ${locale}: ` +
            `"${label}" vs "${seen.label}"`,
        );
      }
      byKey.set(`${nameKey}:${locale}`, { nameKey, name, locale, label });
    }
  }

  return [...byKey.values()];
}

/**
 * Writes what the checked-in files say, or prints what it would write.
 *
 * Exported rather than run on import so `apps/server` can call it from a compiled ops script:
 * a production container has no `tsx`. `apply-translations-cli.ts` is the CLI half.
 */
export async function applyTranslations({ apply }: { apply: boolean }): Promise<void> {
  const { rows: facets, created } = await facetRows(apply);
  const extras = await extraRows();
  const curated = curatedRows();

  const perKind = facetMediaKind.enumValues
    .flatMap((kind) => {
      const count = mergedFacetLabels(kind).size;
      return count === 0 ? [] : [`${kind} ${count}`];
    })
    .join(", ");
  console.log(`facets: ${facets.length} of ${perKind}`);
  console.log(`extras: ${extras.length} id-keyed, ${curated.length} name-keyed`);
  if (created > 0) console.log(`facet rows created: ${created}`);

  if (!apply) {
    console.log("\nDry run. Pass --apply to write.");
    return;
  }

  if (facets.length > 0) {
    await db
      .insert(facetMediaTranslation)
      .values(facets)
      .onConflictDoUpdate({
        target: [facetMediaTranslation.facetMediaId, facetMediaTranslation.locale],
        set: { label: sql`excluded.label`, source: sql`excluded.source`, updatedAt: sql`now()` },
        /*
         * Hand-written copy outranks a generated label, and so does a real vendor one. A vendor
         * label that is only the English value again is not one: NauSYS sends "Other" as its
         * German for "Other", which kept the curated "Sonstiges" off the page. Taking the row over
         * as generated is what stops the next sync writing the English back.
         */
        setWhere: sql`${facetMediaTranslation.source} = 'generated'
          or (${facetMediaTranslation.source} = 'provider'
            and lower(trim(${facetMediaTranslation.label})) = (
              select lower(trim(${facetMedia.value}))
              from ${facetMedia}
              where ${facetMedia.id} = ${facetMediaTranslation.facetMediaId}
            )
            and lower(trim(excluded.label)) <> lower(trim(${facetMediaTranslation.label})))`,
      });
  }

  if (extras.length > 0) {
    await db
      .insert(providerExtraTranslation)
      .values(extras)
      .onConflictDoUpdate({
        target: [
          providerExtraTranslation.source,
          providerExtraTranslation.kind,
          providerExtraTranslation.externalId,
          providerExtraTranslation.locale,
        ],
        set: { label: sql`excluded.label`, updatedAt: sql`now()` },
      });
  }

  /*
   * In batches, because Postgres binds at most 65,535 parameters per statement and this table
   * is the one that grows: five columns times 17,409 rows is 87,045, and the whole run failed
   * on a driver error naming none of that. The other two writes above are an order of
   * magnitude smaller and are left as they are.
   */
  for (let from = 0; from < curated.length; from += CURATED_BATCH) {
    await db
      .insert(extraLabelTranslation)
      .values(curated.slice(from, from + CURATED_BATCH))
      .onConflictDoUpdate({
        target: [extraLabelTranslation.nameKey, extraLabelTranslation.locale],
        set: { name: sql`excluded.name`, label: sql`excluded.label`, updatedAt: sql`now()` },
      });
  }

  console.log(
    `\nWrote ${facets.length} facet labels, ${extras.length} id-keyed and ${curated.length} name-keyed extra labels.`,
  );
}
