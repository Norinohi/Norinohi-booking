/**
 * Writes the generated Ukrainian label set into the two translation tables.
 *
 * Ukrainian is the locale no provider supplies. NauSYS names its reference lists in
 * eighteen languages and none of them is it, so where German and Spanish are sourced and
 * refreshed on every sync, these labels are produced once and reviewed. `translations/uk.json`
 * is that review surface: it is checked in, diffs a word at a time, and this only ever writes
 * what that file says.
 *
 * Rows land as `source = 'generated'`, which is what keeps three writers out of each other's
 * way: the catalogue sync touches only `provider` rows, the seeded editorial copy is never
 * overwritten by either, and re-running this refreshes its own rows and nothing else.
 *
 *   pnpm --filter @yacht-charter/db translations:apply
 *   pnpm --filter @yacht-charter/db translations:apply -- --apply
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./index";
import { extraLabels } from "./translations/extra-labels";
import { facetLabels } from "./translations/facet-labels";
import { ukTranslations } from "./translations/uk";
import { facetMedia, facetMediaKind, facetMediaTranslation } from "./schema/facet-media";
import {
  extraLabelTranslation,
  providerExtraKind,
  providerExtraTranslation,
} from "./schema/listing-source";

/** The locale `translations/uk.ts` is written in; the other two files name their own. */
const LOCALE = "uk";
const apply = process.argv.slice(2).includes("--apply");

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

const translations = translationsSchema.parse(ukTranslations);

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
 * Both facet files as one `value -> locale -> label` map for a kind.
 *
 * `translations/uk.ts` is a single-locale set produced for the vocabulary providers do name in
 * their own languages; `translations/facet-labels.ts` names the handful they never do, in all
 * three. Nothing appears in both, and if something ever does, the multi-locale file wins,
 * because it is the one that can answer for every locale.
 */
function mergedFacetLabels(kind: FacetKindValue) {
  const merged = new Map<string, Record<string, string>>();

  for (const [value, label] of Object.entries(translations.facets[kind] ?? {})) {
    merged.set(value, { [LOCALE]: label });
  }
  for (const [value, byLocale] of Object.entries(curatedFacets[kind] ?? {})) {
    merged.set(value, { ...merged.get(value), ...byLocale });
  }

  return merged;
}

async function facetRows(): Promise<{
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

  for (const [source, labels] of Object.entries(translations.extras)) {
    for (const [key, label] of Object.entries(labels)) {
      const [kind, externalId] = extraKeySchema.parse(key);
      rows.push({ source, kind, externalId, locale: LOCALE, label });
    }
  }

  return rows;
}

/**
 * Mirrors extraNameKeySql in search/repository.ts, which is what the read join folds with.
 * The two have to agree exactly or a curated label is written somewhere nothing reads it.
 */
function extraNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

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

async function main(): Promise<void> {
  const { rows: facets, created } = await facetRows();
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
        set: { label: sql`excluded.label`, updatedAt: sql`now()` },
        // Hand-written copy outranks a generated label, and so does a real vendor one.
        setWhere: sql`${facetMediaTranslation.source} = 'generated'`,
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

  await db
    .insert(extraLabelTranslation)
    .values(curated)
    .onConflictDoUpdate({
      target: [extraLabelTranslation.nameKey, extraLabelTranslation.locale],
      set: { name: sql`excluded.name`, label: sql`excluded.label`, updatedAt: sql`now()` },
    });

  console.log(
    `\nWrote ${facets.length} facet labels, ${extras.length} id-keyed and ${curated.length} name-keyed extra labels.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  await db.$client.end();
  process.exit(1);
}

await db.$client.end();
