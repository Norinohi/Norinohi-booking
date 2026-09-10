import { facetMedia, facetMediaTranslation } from "@yacht-charter/db/schema/facet-media";
import {
  listCuratableFacetValues,
  normalizedFilterValue,
  normalizedKeySql,
  valueForLabel,
} from "@yacht-charter/db/search/index";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  popularFacetKindSchema,
  popularFacetListInputSchema,
  popularFacetListSchema,
  popularFacetSetInputSchema,
  popularFacetSetSchema,
  popularFacetSurfaceSchema,
  popularFacetValueSchema,
} from "../contracts/popular-facets";
import { writeAuditLog } from "./audit";

type Kind = z.infer<typeof popularFacetKindSchema>;
type Surface = z.infer<typeof popularFacetSurfaceSchema>;
type Value = z.infer<typeof popularFacetValueSchema>;
type ListInput = z.infer<typeof popularFacetListInputSchema>;
type ListResult = z.infer<typeof popularFacetListSchema>;
type SetInput = z.infer<typeof popularFacetSetInputSchema>;
type SetResult = z.infer<typeof popularFacetSetSchema>;

const ENTITY_TYPE = "facet_media_rank";
const DEFAULT_LOCALE = "en";

/*
 * Each surface's membership, read back as a rank.
 *
 * `filter` is a boolean column and the other two are ranks, so it reports 1 for a member and
 * null for everything else. That is the whole of the difference between the surfaces on the
 * read side: below this line the three are one list of values in one order.
 */
const RANK_BY_SURFACE = {
  popular: sql<number | null>`${facetMedia.popularRank}`,
  featured: sql<number | null>`${facetMedia.featuredRank}`,
  filter: sql<number | null>`case when ${facetMedia.filterVisible} then 1 else null end`,
} as const;

/** What "already curated" means per surface, for the statement that clears the list. */
const CURATED_BY_SURFACE = {
  popular: isNotNull(facetMedia.popularRank),
  featured: isNotNull(facetMedia.featuredRank),
  filter: eq(facetMedia.filterVisible, true),
} as const;

/** The columns the clearing statement resets, per surface. */
const CLEARED_BY_SURFACE = {
  popular: { popularRank: null },
  featured: { featuredRank: null },
  filter: { filterVisible: false },
} as const;

/*
 * How a surface records one member, given the row of the `(values ...)` list it matched.
 *
 * Raw SQL because the ranks are written by one `update ... from (values ...)`, which Drizzle's
 * builder cannot express. `filter` ignores the position it was handed: being in the list is the
 * whole statement it makes.
 */
const ASSIGN_BY_SURFACE = {
  popular: sql`popular_rank = ranked.rank`,
  featured: sql`featured_rank = ranked.rank`,
  filter: sql`filter_visible = true`,
} as const;

type MediaRow = {
  id: string;
  value: string;
  label: string | null;
  rank: number | null;
  imageUrl: string | null;
  cloudinaryId: string | null;
};

/*
 * Every facet_media row of one kind, with the locale's label and this surface's rank.
 *
 * Rows are read whole rather than filtered to the curated ones because both halves of the
 * screen need them: `selected` is the ranked subset, and `available` needs each row's image and
 * translated label to render a value the catalogue no longer carries.
 */
async function readMedia(db: Database, kind: Kind, surface: Surface, locale: string) {
  const rows = await db
    .select({
      id: facetMedia.id,
      value: facetMedia.value,
      label: facetMediaTranslation.label,
      rank: RANK_BY_SURFACE[surface],
      imageUrl: facetMedia.imageUrl,
      cloudinaryId: facetMedia.cloudinaryId,
    })
    .from(facetMedia)
    .leftJoin(
      facetMediaTranslation,
      and(
        eq(facetMediaTranslation.facetMediaId, facetMedia.id),
        eq(facetMediaTranslation.locale, locale),
      ),
    )
    .where(eq(facetMedia.kind, kind));

  /*
   * Keyed by the fold, so two spellings of one facet are one entry -- and the curated one is the
   * entry that survives.
   *
   * Two rows really do share a key: the translations pipeline writes a row per catalogue
   * spelling while the seed and this screen write the editorial one, so "Teak Cockpit" and
   * "Teak cockpit" are both here. Taking whichever the scan reached last dropped the curated
   * value out of `selected`, and the screen then saved the list it could see -- one value
   * shorter than the one it loaded.
   */
  const byKey = new Map<string, MediaRow>();
  for (const row of rows) {
    const key = normalizedFilterValue(row.value);
    const existing = byKey.get(key);
    if (existing === undefined || (existing.rank === null && row.rank !== null)) {
      byKey.set(key, row);
    }
  }

  return byKey;
}

function toValue(label: string, count: number | null, media: MediaRow | undefined): Value {
  return {
    /* Derived from the untranslated label, the way the facet options derive theirs, so a value
       saved here is the value the search filter compares against. */
    value: valueForLabel(label),
    label: media?.label ?? label,
    rank: media?.rank ?? null,
    count,
    imageUrl: media?.imageUrl ?? null,
    cloudinaryId: media?.cloudinaryId ?? null,
  };
}

/**
 * What is curated for one kind and surface, and what could be.
 *
 * `available` is the union of the catalogue's live vocabulary and the rows already curated,
 * not just the live half. A country that has been curated and has since sold out of boats would
 * otherwise vanish from the only screen that can remove it -- still pinned on the site, and
 * uneditable. It comes back with `count: null`, which is how the table marks it.
 */
export async function listPopularFacets(db: Database, input: ListInput): Promise<ListResult> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const [live, media] = await Promise.all([
    listCuratableFacetValues(db, input.kind),
    readMedia(db, input.kind, input.surface, locale),
  ]);

  const seen = new Set<string>();
  const available: Value[] = [];

  for (const row of live) {
    const key = normalizedFilterValue(row.label);
    seen.add(key);
    available.push(toValue(row.label, row.count, media.get(key)));
  }

  for (const [key, row] of media) {
    if (seen.has(key) || row.rank === null) continue;
    available.push(toValue(row.value, null, row));
  }

  available.sort((left, right) => left.label.localeCompare(right.label));

  /* Ties break on the label so the `filter` surface, whose members all carry 1, reads as the
     alphabetical list the search panel will show rather than as whatever order the rows came
     back in. */
  const selected = available
    .filter((option): option is Value & { rank: number } => option.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));

  return { kind: input.kind, surface: input.surface, selected, available };
}

/**
 * Replaces the curated list for one kind and surface with the values given, in that order.
 *
 * Three statements in one transaction rather than a rank per value: clearing the whole kind
 * first and laying the new order down in a single `update ... from (values ...)` means no
 * moment exists in which two values hold the same rank, which is the failure a
 * move-one-at-a-time reorder has to work around (see `reorderFaq`'s negative-slot pass). Ranks
 * come out 1-based and contiguous because they are the array's own indices.
 *
 * A value with no facet_media row yet is inserted first. That is the ordinary case for anything
 * outside the seed: `facet_media` holds editorial copy, and a country being pinned may have
 * none.
 *
 * On the `filter` surface the order carries no meaning and the same three statements stand: the
 * allowlist is cleared and re-marked, so an editor's list is what the search panel offers and
 * clearing it hands the panel back every value the catalogue carries.
 */
export async function setPopularFacets(
  db: Database,
  actorUserId: string,
  input: SetInput,
): Promise<SetResult> {
  const deduped = new Set(input.values.map(normalizedFilterValue));
  if (deduped.size !== input.values.length) {
    throw new ORPCError("CONFLICT", { message: "A value may appear in the list only once" });
  }

  const before = await listPopularFacets(db, { kind: input.kind, surface: input.surface });

  /*
   * Which values need a facet_media row, and what to call it.
   *
   * The screen sends filter values ("sailing-yacht"), while facet_media stores the label
   * spelling ("Sailing yacht"). The two are the same facet -- everything that reads this table
   * joins on the normalized form -- but they are different strings, so an upsert keyed on the
   * raw value inserts a second row for a facet that already has one. The unique constraint is
   * on the raw pair and cannot say otherwise, so the check happens here: a key already present
   * is left alone, and a genuinely new one is written under the catalogue's own spelling where
   * there is one, falling back to what was sent for a value nothing carries yet.
   */
  const existing = await readMedia(db, input.kind, input.surface, DEFAULT_LOCALE);
  const spellings = new Map(
    before.available.map((option) => [normalizedFilterValue(option.value), option.label]),
  );
  const missing = input.values
    .filter((value) => !existing.has(normalizedFilterValue(value)))
    .map((value) => ({
      kind: input.kind,
      value: spellings.get(normalizedFilterValue(value)) ?? value,
    }));

  await db.transaction(async (tx) => {
    if (missing.length > 0) {
      await tx
        .insert(facetMedia)
        .values(missing)
        .onConflictDoNothing({ target: [facetMedia.kind, facetMedia.value] });
    }

    await tx
      .update(facetMedia)
      .set(CLEARED_BY_SURFACE[input.surface])
      .where(and(eq(facetMedia.kind, input.kind), CURATED_BY_SURFACE[input.surface]));

    if (input.values.length > 0) {
      const ranked = sql.join(
        input.values.map(
          (value, index) => sql`(${normalizedFilterValue(value)}, ${index + 1}::integer)`,
        ),
        sql`, `,
      );

      await tx.execute(sql`
        update facet_media as media
        set ${ASSIGN_BY_SURFACE[input.surface]}
        from (values ${ranked}) as ranked(key, rank)
        where media.kind = ${input.kind}
          and ${normalizedKeySql(sql`media.value`)} = ranked.key
      `);
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: `${input.kind}:${input.surface}`,
      before: before.selected.map((option) => option.value),
      after: input.values,
    });
  });

  const after = await listPopularFacets(db, { kind: input.kind, surface: input.surface });

  /*
   * The facets read is cached for a day and the client's staleTime matches it, so without this
   * a curation change is invisible on the site until tomorrow and the editor concludes the save
   * was lost. Best-effort by construction: the rows are committed by the time this runs, so an
   * unreachable web app is a stale window rather than a failed save, and the result travels
   * back so the screen can say which happened.
   */
  const cache = await revalidateCatalogCache(["catalog"]);

  return { kind: input.kind, surface: input.surface, selected: after.selected, cache };
}
