import { z } from "zod";

import {
  idSchema,
  paginatedSchema,
  paginationInputDefault,
  paginationInputSchema,
} from "./primitives";

/*
 * The authoring contract for the FAQ.
 *
 * The public read (packages/db/src/search/repository.ts) matches `locale` exactly with no
 * fallback, so the same question is four rows — one per locale — and an entry present in three
 * of them is a hole in one page rather than a partial translation. Everything here is therefore
 * expressed in *groups*: a group is one question in every locale that has it, and the editor
 * creates, edits, reorders and deletes at that level. The row is still the unit the database
 * stores and the unit `delete` can address when one translation has to go on its own.
 *
 * A group is keyed by scope + category + sort_order, which is exactly what the seed makes
 * stable: `seed-site-faq.ts` walks the same entry list once per locale and hands entry *k* of a
 * category the same position in all four, so the four rows of one question already share those
 * three columns. Nothing here is allowed to break that — `create` writes one sort_order for the
 * whole group and `reorder` moves every locale of a group together.
 */

/**
 * The site's four locales, mirroring `apps/web/src/i18n/config.ts`. Spelled out rather than
 * left as a free string because this is an authoring surface: a typo'd locale writes a row the
 * public read can never match, and it would look like a saved translation in this screen.
 */
export const faqLocaleSchema = z.enum(["en", "de", "es", "uk"]);

export type FaqLocale = z.infer<typeof faqLocaleSchema>;

/** Locale order for the editor's panes — the default first, then the rest as `config.ts` has them. */
export const FAQ_LOCALES: readonly FaqLocale[] = ["en", "de", "es", "uk"];

/** The `faq_category` enum, in its declaration order, which is the order the page renders. */
export const faqCategorySchema = z.enum([
  "booking",
  "payment",
  "prices",
  "licences",
  "travel",
  "cancellation",
]);

export const faqEntrySchema = z.object({
  id: z.string(),
  locale: faqLocaleSchema,
  question: z.string(),
  /** Null or blank means unanswered: a real row holding its place that the public read drops. */
  answer: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const faqGroupSchema = z.object({
  /** scope + category + sort_order, the three columns the four locale rows share. */
  key: z.string(),
  /** Null is site-wide: the entry renders on every listing page. */
  listingId: z.string().nullable(),
  listingTitle: z.string().nullable(),
  category: faqCategorySchema.nullable(),
  sortOrder: z.number().int(),
  /** In FAQ_LOCALES order, absent locales simply missing — see `missingLocales`. */
  translations: z.array(faqEntrySchema),
  /** The locales with no row at all: this question does not exist on those four pages. */
  missingLocales: z.array(faqLocaleSchema),
  /** The locales whose row exists but has a blank answer: present here, invisible on the site. */
  unansweredLocales: z.array(faqLocaleSchema),
});

/**
 * Which locales a group is missing, and where its answers are blank.
 *
 * `locale` narrows both to a single language: "which questions have no German answer" and
 * "which questions have no German at all" are the two passes the client works through while
 * filling this in, and they are the same two questions asked of one locale rather than of all.
 */
export const faqGapSchema = z.enum(["missing_answer", "missing_locale"]);

const DEFAULT_PAGE_SIZE = 20;

/**
 * Scope is a closed choice rather than an optional listing id so the read stays bounded: the
 * site-wide set is the twenty questions the client wrote, and a listing's set is its own. There
 * is no "everything" option, which would grow with the catalogue.
 */
export const faqScopeSchema = z.enum(["site", "listing"]);

const requireListingForListingScope = (
  value: { scope: z.infer<typeof faqScopeSchema>; listingId?: string },
  ctx: z.RefinementCtx,
) => {
  if (value.scope === "listing" && !value.listingId) {
    ctx.addIssue({
      code: "custom",
      message: "Choose a listing to see its own entries",
      path: ["listingId"],
    });
  }
};

export const faqListInputSchema = z
  .object({
    scope: faqScopeSchema.default("site"),
    listingId: z.string().min(1).optional(),
    category: faqCategorySchema.optional(),
    /** The language the gap checks and the search look at; on its own it filters nothing. */
    locale: faqLocaleSchema.optional(),
    query: z.string().trim().max(200).optional(),
    gap: faqGapSchema.optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default({ scope: "site", ...paginationInputDefault(DEFAULT_PAGE_SIZE) })
  .superRefine(requireListingForListingScope);

/**
 * Counted over everything the scope, category, locale and search filters match, before `gap`
 * narrows it — so the two gap views can say how much of the whole is still outstanding rather
 * than only how much of itself.
 */
export const faqListSchema = paginatedSchema(faqGroupSchema).extend({
  summary: z.object({
    groups: z.number().int(),
    missingAnswer: z.number().int(),
    missingLocale: z.number().int(),
  }),
});

export const faqIdInputSchema = z.object({ id: idSchema });

/**
 * What became of the attempt to drop the web app's cached catalog reads.
 *
 * The listing detail page caches its FAQ for `hours` (docs/adr/0002), so a saved edit is
 * invisible on the site until that window turns over or the tag is dropped. Every mutation here
 * asks the web app to drop it, and the request is best-effort in exactly the way the provider
 * sync's is: an unreachable web app leaves a stale window, which is the old behaviour, and is
 * not a reason to roll back a save that already committed. It is reported instead of thrown so
 * the editor learns that the page will lag rather than that the save failed.
 */
export const faqCacheSchema = z.object({
  attempted: z.boolean(),
  ok: z.boolean(),
  reason: z.string().optional(),
});

export const faqEntryResultSchema = z.object({
  entry: faqGroupSchema,
  cache: faqCacheSchema,
});

/**
 * `faq_scope_ck` says a site-wide entry must carry a category, and this repeats it rather than
 * leaning on the constraint: a check violation reaches the browser as an unlabelled 500, while
 * this comes back attached to `category` and the picker can show it.
 *
 * Both keys are required-and-nullable rather than optional, because the rule is about the pair.
 * An update that named only `listingId: null` would leave Zod unable to see whether a category
 * exists, and the editor always has both on screen anyway.
 */
const faqScopeFields = {
  listingId: z.string().min(1).nullable(),
  category: faqCategorySchema.nullable(),
};

const requireCategoryWhenSiteWide = (
  value: { listingId: string | null; category: z.infer<typeof faqCategorySchema> | null },
  ctx: z.RefinementCtx,
) => {
  if (value.listingId === null && value.category === null) {
    ctx.addIssue({
      code: "custom",
      message: "A site-wide entry needs a category — it has no listing page to sit on",
      path: ["category"],
    });
  }
};

export const faqTranslationInputSchema = z.object({
  locale: faqLocaleSchema,
  question: z.string().trim().min(1).max(500),
  /** Empty is stored as null: the read path treats blank and absent alike, so writing both would
      let the same state be recorded two ways. */
  answer: z.string().trim().max(8000).nullable().optional(),
});

/** One locale per group, or a save would silently keep whichever copy was written last. */
const uniqueLocales = (
  value: { locale: z.infer<typeof faqLocaleSchema> }[],
  ctx: z.RefinementCtx,
) => {
  const seen = new Set(value.map((item) => item.locale));
  if (seen.size !== value.length) {
    ctx.addIssue({ code: "custom", message: "Each locale can appear only once" });
  }
};

const translationsSchema = z.array(faqTranslationInputSchema).min(1).superRefine(uniqueLocales);

export const faqCreateInputSchema = z
  .object({
    ...faqScopeFields,
    translations: translationsSchema,
  })
  .superRefine(requireCategoryWhenSiteWide);

/**
 * Addressed by any row in the group. Locales left out of `translations` keep their question and
 * answer — they still follow the group if its scope moves. Removing one is `delete`, not an
 * omission here, so a half-filled form cannot quietly drop a translation.
 */
export const faqUpdateInputSchema = z
  .object({
    id: idSchema,
    ...faqScopeFields,
    translations: translationsSchema,
  })
  .superRefine(requireCategoryWhenSiteWide);

export const faqDeleteInputSchema = z.object({
  id: idSchema,
  /** The whole question in every language, rather than the one translation `id` names. */
  allLocales: z.boolean().default(false),
});

export const faqDeletedSchema = z.object({
  ids: z.array(z.string()),
  cache: faqCacheSchema,
});

/**
 * The whole list for one (scope, category) as it reads in `locale`, in its new order. Partial
 * orders are refused: the entries left out would keep positions the reordered ones now want.
 */
export const faqReorderedSchema = z.object({
  entries: z.array(faqGroupSchema),
  cache: faqCacheSchema,
});

export const faqReorderInputSchema = z
  .object({
    ...faqScopeFields,
    locale: faqLocaleSchema,
    ids: z.array(idSchema).min(1),
  })
  .superRefine(requireCategoryWhenSiteWide);
