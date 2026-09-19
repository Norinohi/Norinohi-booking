import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { perTranslatedLocale, TRANSLATED_LOCALES, type TranslatedLocale } from "./locales";

import boatTypesJson from "./boat-types.json" with { type: "json" };

import type * as schema from "./schema/index";
import { facetMedia, facetMediaTranslation } from "./schema/facet-media";
import { normalizedKey, normalizedKeySql } from "./search/normalize";

type Database = NodePgDatabase<typeof schema>;
/*
 * English has no translation row: its label is the catalogue's own value, and a row here would
 * override it and mix "Motor Boat" in among "Sailing yacht" in the filters.
 */
type Locale = TranslatedLocale;
const LOCALES = TRANSLATED_LOCALES;
type Copy = { label: string; description: string };

const copySchema = z.object({ label: z.string(), description: z.string() });

type SeedBoatType = {
  /** The facet value as the catalogue spells it, matched on its normalized form. */
  value: string;
  description: string;
  copy: Record<Locale, Copy>;
};

/**
 * The boat-type cards' copy in every locale: the client's texts for Gulet, Motor boat, House boat
 * and Motor catamaran, and the copy the first four types already carried in `seed.ts`.
 *
 * The German for those first four was never written alongside the rest, so it is a draft in
 * `boat-types.json`.
 */
export const BOAT_TYPES: SeedBoatType[] = z
  .array(
    z.object({
      value: z.string(),
      description: z.string(),
      copy: perTranslatedLocale(copySchema),
    }),
  )
  .parse(boatTypesJson);

export type BoatTypesPlan = {
  /** Values with no facet_media row yet, which the seed inserts. */
  created: string[];
  updated: string[];
  unchanged: string[];
};

async function findRow(db: Database, value: string) {
  const [row] = await db
    .select({ id: facetMedia.id, description: facetMedia.description })
    .from(facetMedia)
    .where(
      and(
        eq(facetMedia.kind, "category"),
        sql`${normalizedKeySql(sql`${facetMedia.value}`)} = ${normalizedKey(value)}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Writes the boat types' label and description in every locale, and nothing else: image, ranks and
 * filter visibility stay as the admin screen left them.
 *
 * Rows are found by normalized value rather than by id, because the ids were minted per environment
 * by the translations pipeline. The copy lands as `editorial`, which is what keeps the pipeline and
 * the catalogue sync from writing over it.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedBoatTypes(
  db: Database,
  { apply }: { apply: boolean },
): Promise<BoatTypesPlan> {
  const plan: BoatTypesPlan = { created: [], updated: [], unchanged: [] };
  const rows = new Map<string, { id: string } | null>();

  for (const boatType of BOAT_TYPES) {
    const row = await findRow(db, boatType.value);
    rows.set(boatType.value, row);
    if (!row) {
      plan.created.push(boatType.value);
      continue;
    }

    const translations = await db
      .select({
        locale: facetMediaTranslation.locale,
        label: facetMediaTranslation.label,
        description: facetMediaTranslation.description,
      })
      .from(facetMediaTranslation)
      .where(eq(facetMediaTranslation.facetMediaId, row.id));
    const same =
      row.description === boatType.description &&
      LOCALES.every((locale) =>
        translations.some(
          (translation) =>
            translation.locale === locale &&
            translation.label === boatType.copy[locale].label &&
            translation.description === boatType.copy[locale].description,
        ),
      );
    (same ? plan.unchanged : plan.updated).push(boatType.value);
  }

  if (!apply) return plan;

  await db.transaction(async (tx) => {
    for (const boatType of BOAT_TYPES) {
      const found = rows.get(boatType.value);
      let facetMediaId: string;
      if (found) {
        facetMediaId = found.id;
        await tx
          .update(facetMedia)
          .set({ description: boatType.description })
          .where(eq(facetMedia.id, facetMediaId));
      } else {
        const [inserted] = await tx
          .insert(facetMedia)
          .values({
            kind: "category",
            value: boatType.value,
            description: boatType.description,
          })
          .returning({ id: facetMedia.id });
        if (!inserted) throw new Error(`facet_media insert returned nothing for ${boatType.value}`);
        facetMediaId = inserted.id;
      }

      await tx
        .insert(facetMediaTranslation)
        .values(
          LOCALES.map((locale) => ({
            facetMediaId,
            locale,
            label: boatType.copy[locale].label,
            description: boatType.copy[locale].description,
            source: "editorial" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [facetMediaTranslation.facetMediaId, facetMediaTranslation.locale],
          set: {
            label: sql`excluded.label`,
            description: sql`excluded.description`,
            source: sql`excluded.source`,
          },
        });
    }
  });

  return plan;
}
