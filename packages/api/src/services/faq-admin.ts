import { ORPCError } from "@orpc/server";
import { faq } from "@yacht-charter/db/schema/content";
import { listing } from "@yacht-charter/db/schema/listing";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import {
  FAQ_LOCALES,
  type faqCacheSchema,
  type faqCategorySchema,
  type faqCreateInputSchema,
  type faqDeleteInputSchema,
  type faqEntryResultSchema,
  type faqGroupSchema,
  type faqListInputSchema,
  type faqListSchema,
  faqLocaleSchema,
  type faqReorderedSchema,
  type faqReorderInputSchema,
  type faqUpdateInputSchema,
} from "../contracts/faq";
import { writeAuditLog } from "./audit";
import { paginationFor } from "./pagination";

type FaqCategory = z.infer<typeof faqCategorySchema>;
type FaqLocale = z.infer<typeof faqLocaleSchema>;
type FaqGroup = z.infer<typeof faqGroupSchema>;
type FaqCache = z.infer<typeof faqCacheSchema>;
type EntryResult = z.infer<typeof faqEntryResultSchema>;
type ReorderResult = z.infer<typeof faqReorderedSchema>;
type FaqEntry = FaqGroup["translations"][number];
type ListInput = z.infer<typeof faqListInputSchema>;
type ListResult = z.infer<typeof faqListSchema>;
type CreateInput = z.infer<typeof faqCreateInputSchema>;
type UpdateInput = z.infer<typeof faqUpdateInputSchema>;
type DeleteInput = z.infer<typeof faqDeleteInputSchema>;
type ReorderInput = z.infer<typeof faqReorderInputSchema>;

type FaqRow = typeof faq.$inferSelect;
type RowWithListing = { entry: FaqRow; listingTitle: string | null };

const ENTITY_TYPE = "faq";

/**
 * Drops the web app's cached copy of whatever this edit changed.
 *
 * The listing detail page caches its read for `hours` and tags it with both the catalog tag and
 * its own (`apps/web/src/lib/cache-tags.ts`), so without this an editor saves, reloads, sees the
 * old page and concludes the save was lost. A site-wide entry renders on every listing page and
 * belongs to none, so it can only be dropped by the broad tag; a listing's own entry takes the
 * narrow one and leaves the rest of the catalog cached.
 *
 * Best-effort by construction — `revalidateCatalogCache` reports rather than throws — because
 * the rows are already committed by the time this runs and an unreachable web app is a stale
 * window, not a failed save. The result travels back so the screen can say which happened.
 */
function catalogTagsFor(listingId: string | null): string[] {
  return listingId === null ? ["catalog"] : [`listing:${listingId}`];
}

function revalidate(listingId: string | null): Promise<FaqCache> {
  return revalidateCatalogCache(catalogTagsFor(listingId));
}

/**
 * The three columns the four locale rows of one question share.
 *
 * This is the whole grouping decision: `seed-site-faq.ts` numbers entry *k* of a category
 * identically in every locale, so scope + category + sort_order already identifies "the same
 * question in four languages" with nothing added to the schema. Deriving it from the row id
 * instead was the alternative and is not safe — the seed's ids carry the locale in the middle
 * (`faq_site_en_booking_1`) while an admin-created row gets `faq_<nanoid>`, and nanoid's
 * alphabet contains underscores, so no split of an id is reliable.
 */
function keyOf(listingId: string | null, category: FaqCategory | null, sortOrder: number): string {
  return `${listingId ?? "site"}|${category ?? ""}|${sortOrder}`;
}

/** Blank and absent are the same state to the public read, so only one of them is ever stored. */
function normalizeAnswer(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasAnswer(value: string | null): boolean {
  return normalizeAnswer(value) !== null;
}

/**
 * `faq.locale` is a plain text column with a default, so a row can in principle hold a locale the
 * site does not serve. Such a row is unreachable from every page; parsing here keeps it out of
 * the editor rather than showing it as a translation somebody could edit.
 */
function localeOf(row: FaqRow): FaqLocale | null {
  const parsed = faqLocaleSchema.safeParse(row.locale);
  return parsed.success ? parsed.data : null;
}

function toEntry(row: FaqRow, locale: FaqLocale): FaqEntry {
  return {
    id: row.id,
    locale,
    question: row.question,
    answer: normalizeAnswer(row.answer),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rows arrive ordered by category then sort_order, so first-seen order is the page's order. */
function toGroups(rows: RowWithListing[]): FaqGroup[] {
  const groups = new Map<string, FaqGroup>();

  for (const { entry: row, listingTitle } of rows) {
    const locale = localeOf(row);
    if (!locale) continue;

    const key = keyOf(row.listingId, row.category, row.sortOrder);
    const group = groups.get(key) ?? {
      key,
      listingId: row.listingId,
      listingTitle,
      category: row.category,
      sortOrder: row.sortOrder,
      translations: [],
      missingLocales: [],
      unansweredLocales: [],
    };

    group.translations.push(toEntry(row, locale));
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.translations.sort(
      (a, b) => FAQ_LOCALES.indexOf(a.locale) - FAQ_LOCALES.indexOf(b.locale),
    );
    const present = new Set(group.translations.map((entry) => entry.locale));
    group.missingLocales = FAQ_LOCALES.filter((locale) => !present.has(locale));
    group.unansweredLocales = group.translations
      .filter((entry) => !hasAnswer(entry.answer))
      .map((entry) => entry.locale);
  }

  return [...groups.values()];
}

function scopeWhere(listingId: string | null, category: FaqCategory | null) {
  return and(
    listingId === null ? isNull(faq.listingId) : eq(faq.listingId, listingId),
    category === null ? isNull(faq.category) : eq(faq.category, category),
  );
}

function matchesQuery(group: FaqGroup, needle: string, locale: FaqLocale | undefined): boolean {
  const searched = locale
    ? group.translations.filter((entry) => entry.locale === locale)
    : group.translations;

  return searched.some(
    (entry) =>
      entry.question.toLowerCase().includes(needle) ||
      (entry.answer?.toLowerCase().includes(needle) ?? false),
  );
}

function isMissingAnswer(group: FaqGroup, locale: FaqLocale | undefined): boolean {
  return locale ? group.unansweredLocales.includes(locale) : group.unansweredLocales.length > 0;
}

function isMissingLocale(group: FaqGroup, locale: FaqLocale | undefined): boolean {
  return locale ? group.missingLocales.includes(locale) : group.missingLocales.length > 0;
}

/**
 * Groups are built in memory rather than in SQL, and paged there too.
 *
 * The scope is what makes that honest: the site-wide set is the twenty questions the client
 * wrote (eighty rows across four locales) and a listing's set is its own handful, so neither
 * read is unbounded. A `group by` would have to reassemble the four locale rows into one object
 * anyway, and the gap filters ask questions — "which locales are absent" — that only exist once
 * the group is whole.
 */
export async function listFaq(db: Database, input: ListInput): Promise<ListResult> {
  /* The input schema already refuses a listing scope with no listing; this is the type-level
     half of the same rule, and a wrong answer is worse than a refusal either way. */
  if (input.scope === "listing" && !input.listingId) {
    throw new ORPCError("BAD_REQUEST", { message: "A listing scope needs a listing id" });
  }

  const filters = [input.listingId ? eq(faq.listingId, input.listingId) : isNull(faq.listingId)];
  if (input.category) filters.push(eq(faq.category, input.category));

  const rows = await db
    .select({ entry: faq, listingTitle: listing.title })
    .from(faq)
    .leftJoin(listing, eq(listing.id, faq.listingId))
    .where(and(...filters))
    .orderBy(asc(faq.category), asc(faq.sortOrder), asc(faq.createdAt));

  const groups = toGroups(rows);
  const needle = input.query?.toLowerCase();
  const searched = needle
    ? groups.filter((group) => matchesQuery(group, needle, input.locale))
    : groups;

  const summary = {
    groups: searched.length,
    missingAnswer: searched.filter((group) => isMissingAnswer(group, input.locale)).length,
    missingLocale: searched.filter((group) => isMissingLocale(group, input.locale)).length,
  };

  const matching = searched.filter((group) => {
    if (input.gap === "missing_answer") return isMissingAnswer(group, input.locale);
    if (input.gap === "missing_locale") return isMissingLocale(group, input.locale);
    return true;
  });

  const offset = (input.page - 1) * input.pageSize;
  const items = matching.slice(offset, offset + input.pageSize);

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems: matching.length,
      itemCount: items.length,
    }),
    summary,
  };
}

async function loadRow(db: DatabaseExecutor, id: string): Promise<FaqRow> {
  const [row] = await db.select().from(faq).where(eq(faq.id, id)).limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown FAQ entry" });
  return row;
}

async function loadGroupRows(
  db: DatabaseExecutor,
  listingId: string | null,
  category: FaqCategory | null,
  sortOrder: number,
): Promise<FaqRow[]> {
  return db
    .select()
    .from(faq)
    .where(and(scopeWhere(listingId, category), eq(faq.sortOrder, sortOrder)))
    .orderBy(asc(faq.createdAt));
}

async function groupOf(db: Database, rows: FaqRow[]): Promise<FaqGroup> {
  const first = rows[0];
  if (!first) throw new ORPCError("NOT_FOUND", { message: "Unknown FAQ entry" });

  const [owner] = first.listingId
    ? await db
        .select({ title: listing.title })
        .from(listing)
        .where(eq(listing.id, first.listingId))
        .limit(1)
    : [];

  const group = toGroups(rows.map((entry) => ({ entry, listingTitle: owner?.title ?? null })))[0];
  if (!group) throw new ORPCError("NOT_FOUND", { message: "Unknown FAQ entry" });
  return group;
}

export async function getFaqGroup(db: Database, id: string): Promise<FaqGroup> {
  const row = await loadRow(db, id);
  return groupOf(db, await loadGroupRows(db, row.listingId, row.category, row.sortOrder));
}

/** A dangling listing id would file the entry on a page that does not exist. */
async function assertListingExists(db: Database, listingId: string | null): Promise<void> {
  if (!listingId) return;
  const [row] = await db
    .select({ id: listing.id })
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: `Unknown listing ${listingId}` });
}

/** Appends to the end of the (scope, category) list the entry is being filed under. */
async function nextSortOrder(
  db: DatabaseExecutor,
  listingId: string | null,
  category: FaqCategory | null,
): Promise<number> {
  const [row] = await db
    .select({ highest: sql<number | null>`max(${faq.sortOrder})` })
    .from(faq)
    .where(scopeWhere(listingId, category));

  return (row?.highest ?? -1) + 1;
}

export async function createFaqEntry(
  db: Database,
  actorUserId: string,
  input: CreateInput,
): Promise<EntryResult> {
  await assertListingExists(db, input.listingId);

  const sortOrder = await db.transaction(async (tx) => {
    const position = await nextSortOrder(tx, input.listingId, input.category);

    /* One sort_order for the whole group: it is half the key the four locale rows are found by,
       so writing them one at a time with separate positions would create four questions. */
    const created = await tx
      .insert(faq)
      .values(
        input.translations.map((translation) => ({
          listingId: input.listingId,
          category: input.category,
          locale: translation.locale,
          question: translation.question,
          answer: normalizeAnswer(translation.answer),
          sortOrder: position,
        })),
      )
      .returning({ id: faq.id, locale: faq.locale });

    for (const row of created) {
      await writeAuditLog(tx, {
        actorUserId,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        after: {
          listingId: input.listingId,
          category: input.category,
          locale: row.locale,
          sortOrder: position,
        },
      });
    }

    return position;
  });

  return {
    entry: await groupOf(db, await loadGroupRows(db, input.listingId, input.category, sortOrder)),
    cache: await revalidate(input.listingId),
  };
}

export async function updateFaqEntry(
  db: Database,
  actorUserId: string,
  input: UpdateInput,
): Promise<EntryResult> {
  const anchor = await loadRow(db, input.id);
  const existing = await loadGroupRows(db, anchor.listingId, anchor.category, anchor.sortOrder);
  await assertListingExists(db, input.listingId);

  const movedScope = input.listingId !== anchor.listingId || input.category !== anchor.category;

  const sortOrder = await db.transaction(async (tx) => {
    /* A group that changes scope leaves a position behind and needs one in the list it joins;
       reusing the old number would land it on top of whatever already holds it there. */
    const position = movedScope
      ? await nextSortOrder(tx, input.listingId, input.category)
      : anchor.sortOrder;

    const byLocale = new Map(
      existing.flatMap((row) => {
        const locale = localeOf(row);
        return locale ? [[locale, row] as const] : [];
      }),
    );

    for (const translation of input.translations) {
      const row = byLocale.get(translation.locale);
      const after = {
        listingId: input.listingId,
        category: input.category,
        locale: translation.locale,
        question: translation.question,
        answer: normalizeAnswer(translation.answer),
        sortOrder: position,
      };

      if (row) {
        await tx.update(faq).set(after).where(eq(faq.id, row.id));
        await writeAuditLog(tx, {
          actorUserId,
          action: "update",
          entityType: ENTITY_TYPE,
          entityId: row.id,
          before: {
            listingId: row.listingId,
            category: row.category,
            question: row.question,
            answer: row.answer,
            sortOrder: row.sortOrder,
          },
          after,
        });
        continue;
      }

      const [created] = await tx.insert(faq).values(after).returning({ id: faq.id });
      if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
      await writeAuditLog(tx, {
        actorUserId,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: created.id,
        after,
      });
    }

    /* Locales the form left out keep their wording but still follow the group, or a scope change
       would split the question across two scopes and the untouched half would vanish. */
    const untouched = existing.filter(
      (row) => !input.translations.some((translation) => translation.locale === row.locale),
    );
    if (movedScope && untouched.length > 0) {
      await tx
        .update(faq)
        .set({ listingId: input.listingId, category: input.category, sortOrder: position })
        .where(
          inArray(
            faq.id,
            untouched.map((row) => row.id),
          ),
        );

      for (const row of untouched) {
        await writeAuditLog(tx, {
          actorUserId,
          action: "update",
          entityType: ENTITY_TYPE,
          entityId: row.id,
          before: { listingId: row.listingId, category: row.category, sortOrder: row.sortOrder },
          after: { listingId: input.listingId, category: input.category, sortOrder: position },
        });
      }
    }

    return position;
  });

  /* Both scopes when the entry moved between them: the page it left has to lose it too. */
  const cache = await revalidate(input.listingId);
  if (movedScope) await revalidate(anchor.listingId);

  return {
    entry: await groupOf(db, await loadGroupRows(db, input.listingId, input.category, sortOrder)),
    cache,
  };
}

export async function deleteFaqEntry(
  db: Database,
  actorUserId: string,
  input: DeleteInput,
): Promise<{ ids: string[]; cache: FaqCache }> {
  const anchor = await loadRow(db, input.id);
  const doomed = input.allLocales
    ? await loadGroupRows(db, anchor.listingId, anchor.category, anchor.sortOrder)
    : [anchor];

  await db.transaction(async (tx) => {
    await tx.delete(faq).where(
      inArray(
        faq.id,
        doomed.map((row) => row.id),
      ),
    );

    for (const row of doomed) {
      await writeAuditLog(tx, {
        actorUserId,
        action: "delete",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        before: {
          listingId: row.listingId,
          category: row.category,
          locale: row.locale,
          question: row.question,
          answer: row.answer,
          sortOrder: row.sortOrder,
        },
      });
    }
  });

  return { ids: doomed.map((row) => row.id), cache: await revalidate(anchor.listingId) };
}

/**
 * Reorders one (scope, category) list as it reads in `locale`, and moves every translation with
 * it.
 *
 * Per-locale positions are what the public read sorts on, so the input is the list the editor is
 * actually looking at. Writing only that locale's rows would be the wrong half of the job: the
 * four locales share `sort_order` as part of their key, so renumbering one language alone both
 * splits the group and leaves the site listing the same questions in a different order per
 * language. A question is one question; it moves in all four.
 *
 * Groups with no row in `locale` cannot be placed by an editor who cannot see them, so they keep
 * their relative order and settle after the ones that were named.
 */
export async function reorderFaq(
  db: Database,
  actorUserId: string,
  input: ReorderInput,
): Promise<ReorderResult> {
  const rows = await db
    .select()
    .from(faq)
    .where(scopeWhere(input.listingId, input.category))
    .orderBy(asc(faq.sortOrder), asc(faq.createdAt));

  const inLocale = rows.filter((row) => row.locale === input.locale);
  const submitted = new Set(input.ids);
  if (submitted.size !== input.ids.length || submitted.size !== inLocale.length) {
    throw new ORPCError("CONFLICT", { message: "Reorder must list every entry exactly once" });
  }

  const positionById = new Map(inLocale.map((row) => [row.id, row.sortOrder]));
  const placed = new Map<number, number>();
  for (const [index, id] of input.ids.entries()) {
    const previous = positionById.get(id);
    if (previous === undefined) {
      throw new ORPCError("NOT_FOUND", { message: `Entry ${id} is not in this list` });
    }
    placed.set(previous, index);
  }

  let trailing = placed.size;
  for (const row of rows) {
    if (placed.has(row.sortOrder)) continue;
    placed.set(row.sortOrder, trailing);
    trailing += 1;
  }

  await db.transaction(async (tx) => {
    /* Two passes, because `sort_order` is both what is being written and what selects the rows
       to write: moving group 0 to slot 1 while group 1 still sits there would leave two groups
       matching the next update. Negative slots occur nowhere else, so the first pass parks
       every group on one and the second lays them down. */
    for (const [previous, next] of placed) {
      await tx
        .update(faq)
        .set({ sortOrder: -(next + 1) })
        .where(and(scopeWhere(input.listingId, input.category), eq(faq.sortOrder, previous)));
    }

    for (const next of placed.values()) {
      await tx
        .update(faq)
        .set({ sortOrder: next })
        .where(and(scopeWhere(input.listingId, input.category), eq(faq.sortOrder, -(next + 1))));
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: null,
      before: { locale: input.locale, ids: inLocale.map((row) => row.id) },
      after: { locale: input.locale, ids: input.ids },
    });
  });

  const reordered = await db
    .select({ entry: faq, listingTitle: listing.title })
    .from(faq)
    .leftJoin(listing, eq(listing.id, faq.listingId))
    .where(scopeWhere(input.listingId, input.category))
    .orderBy(asc(faq.sortOrder), asc(faq.createdAt));

  return { entries: toGroups(reordered), cache: await revalidate(input.listingId) };
}
