import { z } from "zod";

import {
  idSchema,
  paginatedSchema,
  paginationInputDefault,
  paginationInputSchema,
} from "./primitives";

/* ------------------------------------------------------------ suggested routes */

export const suggestedRouteKindSchema = z.enum([
  "seven_days",
  "fourteen_days",
  "family",
  "first_time_sailors",
  "active_sailing",
]);

export const routeDifficultySchema = z.enum(["easy", "moderate", "advanced"]);

/**
 * The languages a route is authored in.
 *
 * The same four `apps/web/src/i18n/config.ts` declares, restated the way `contracts/faq.ts`
 * restates them. The duplication is deliberate and shallow: adding a language is then two edits
 * that fail loudly rather than one that quietly leaves a screen with three panes.
 */
export const routeLocaleSchema = z.enum(["en", "de", "es", "uk"]);
export const ROUTE_LOCALES = routeLocaleSchema.options;

/**
 * One language's copy for a route.
 *
 * Both fields are nullable because a half-translated route is a real state -- the editor writes
 * English first -- and the read falls back to the route's own columns rather than blanking the
 * card.
 */
export const routeTranslationSchema = z.object({
  locale: routeLocaleSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
});

/**
 * The languages a stop's note is translated into.
 *
 * English is missing on purpose: it lives on the stop itself, in `note`, and is what every other
 * language falls back to. Holding it in both places would leave the read no rule for which wins.
 */
export const routeStopNoteLocaleSchema = z.enum(["de", "es", "uk"]);
export const ROUTE_STOP_NOTE_LOCALES = routeStopNoteLocaleSchema.options;

export const routeStopNoteTranslationSchema = z.object({
  locale: routeStopNoteLocaleSchema,
  note: z.string().nullable(),
});

export const routeStopSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  sortOrder: z.number().int(),
  /** The English note, and the fallback for a language that has none. */
  note: z.string().nullable(),
  noteTranslations: z.array(routeStopNoteTranslationSchema),
  /** The languages this stop has no note in yet, so the editor can flag the gap. */
  missingNoteLocales: z.array(routeStopNoteLocaleSchema),
});

export const routeSchema = z.object({
  id: z.string(),
  baseId: z.string().nullable(),
  regionId: z.string().nullable(),
  /** "Marina Kaštela · Split · Croatia" or "Ionian · Greece", so the table needs no second read. */
  targetLabel: z.string(),
  /** Where the stop editor's map opens when the route targets a base that has coordinates. */
  targetPoint: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  title: z.string(),
  /** The public address, `/routes/<slug>`. */
  slug: z.string(),
  kind: suggestedRouteKindSchema,
  nights: z.number().int(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  /** Position in the site-wide popular list, or null for a route that is not in it. */
  featuredRank: z.number().int().positive().nullable(),
  imageUrl: z.string().nullable(),
  cloudinaryId: z.string().nullable(),
  difficulty: routeDifficultySchema.nullable(),
  translations: z.array(routeTranslationSchema),
  /** The languages this route has no copy in yet, so the table can flag the gap. */
  missingLocales: z.array(routeLocaleSchema),
  stops: z.array(routeStopSchema),
  createdAt: z.string(),
});

const DEFAULT_PAGE_SIZE = 20;

export const routeListInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    kind: suggestedRouteKindSchema.optional(),
    /** The country the route's base or region sits in — the client authors country by country. */
    countryId: z.string().min(1).optional(),
    active: z.boolean().optional(),
    /* Names the target's places in this locale; the stored names are the vendor's English. */
    locale: z.string().min(2).max(10).optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

export const routeListSchema = paginatedSchema(routeSchema).extend({
  /** Whether this environment can store an uploaded photo; without it the URL field is the way. */
  imageUploadEnabled: z.boolean(),
});

/**
 * Lowercase words joined by single hyphens, the shape `routeSlug` writes. Checked here so a
 * hand-edited address cannot carry a space, a slash or a capital into a URL.
 */
export const routeSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");

export const routeImageUploadInputSchema = z.object({
  file: z
    .file()
    .max(10 * 1024 * 1024)
    .mime(["image/jpeg", "image/png", "image/webp", "image/avif"]),
});

export const routeImageUploadSchema = z.object({ url: z.string() });

export const routeIdInputSchema = z.object({ id: idSchema });

/**
 * `suggested_route_target_ck` says a route targets a base or a region and never both. Repeating
 * the rule here rather than leaning on the constraint is deliberate: a check violation surfaces
 * through the driver as an unlabelled 500, while this comes back attached to `baseId` and the
 * target picker can show it.
 */
const exactlyOneTarget = (
  value: { baseId?: string | null; regionId?: string | null },
  ctx: z.RefinementCtx,
) => {
  const hasBase = Boolean(value.baseId);
  const hasRegion = Boolean(value.regionId);
  if (hasBase === hasRegion) {
    ctx.addIssue({
      code: "custom",
      message: hasBase
        ? "A route targets a base or a region, not both"
        : "Choose a base or a region for this route",
      path: ["baseId"],
    });
  }
};

const routeFieldsSchema = z.object({
  baseId: z.string().min(1).nullable().optional(),
  regionId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  /*
   * Optional on create, where it is derived from the title. Changing it later moves the public
   * page, so the old address stops resolving: the editor says so beside the field.
   */
  slug: routeSlugSchema.optional(),
  kind: suggestedRouteKindSchema,
  /* A charter is sold in nights; two weeks is the longest itinerary the client writes. */
  nights: z.number().int().min(1).max(28),
  description: z.string().trim().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
  imageUrl: z.string().trim().max(2000).nullable().optional(),
  cloudinaryId: z.string().trim().max(500).nullable().optional(),
  difficulty: routeDifficultySchema.nullable().optional(),
  /*
   * Absent leaves the stored copy alone; a supplied list replaces the locales it names and
   * leaves the rest. Nulling both fields of a locale removes that language's row, which is how
   * a translation is withdrawn without deleting the route.
   */
  translations: z
    .array(
      z.object({
        locale: routeLocaleSchema,
        title: z.string().trim().max(200).nullable().optional(),
        description: z.string().trim().max(4000).nullable().optional(),
      }),
    )
    .max(ROUTE_LOCALES.length)
    .optional(),
});

/**
 * The whole featured list in its new order, most prominent first.
 *
 * A partial order is refused for the reason `faq.reorder` refuses one: the routes left out would
 * keep ranks the reordered ones now want. An empty list clears the featured selection.
 */
export const routeFeaturedReorderInputSchema = z.object({
  ids: z.array(idSchema).max(50),
});

export const routeFeaturedSchema = z.object({
  routes: z.array(routeSchema),
});

export const routeCreateInputSchema = routeFieldsSchema.superRefine(exactlyOneTarget);

/**
 * Partial except for the target: an update that names neither key would leave the row's existing
 * target alone, so the pair is validated only when the form actually submits one.
 */
export const routeUpdateInputSchema = routeFieldsSchema
  .partial()
  .extend({ id: idSchema })
  .superRefine((value, ctx) => {
    if (value.baseId === undefined && value.regionId === undefined) return;
    exactlyOneTarget(value, ctx);
  });

export const routeSetActiveInputSchema = z.object({ id: idSchema, active: z.boolean() });

/* ------------------------------------------------------------------- stops */

/**
 * Latitude and longitude are bounded here rather than left to the column, because the failure
 * this table exists to stop is a plausible-looking wrong number, and a transposed pair is the
 * common one: Croatian marinas sit near 43.5, 16.4, and swapping them is still inside both
 * ranges. The bounds catch the typo that is not, and the map input catches the rest.
 */
const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

/*
 * Absent leaves the stored notes alone; a supplied list replaces the locales it names and leaves
 * the rest. An empty note removes that language's row, which is how a translation is withdrawn.
 */
const stopNoteTranslationsSchema = z
  .array(
    z.object({
      locale: routeStopNoteLocaleSchema,
      note: z.string().trim().max(2000).nullable().optional(),
    }),
  )
  .max(ROUTE_STOP_NOTE_LOCALES.length)
  .optional();

export const routeStopCreateInputSchema = z.object({
  routeId: idSchema,
  name: z.string().trim().min(1).max(200),
  lat: latSchema,
  lng: lngSchema,
  note: z.string().trim().max(2000).nullable().optional(),
  noteTranslations: stopNoteTranslationsSchema,
});

export const routeStopUpdateInputSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200).optional(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  noteTranslations: stopNoteTranslationsSchema,
});

export const routeStopIdInputSchema = z.object({ id: idSchema });

/** The whole list in its new order — a partial order would leave `sort_order` with a hole. */
export const routeStopReorderInputSchema = z.object({
  routeId: idSchema,
  stopIds: z.array(idSchema).min(1),
});

/* -------------------------------------------------------------- geography */

export const geographyOptionsInputSchema = z
  .object({
    /** Narrows regions and bases; the country list is always returned whole. */
    countryId: z.string().min(1).optional(),
    query: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    locale: z.string().min(2).max(10).optional(),
  })
  .default({ limit: 50 });

export const geographyOptionsSchema = z.object({
  countries: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      countryId: z.string(),
      countryName: z.string(),
      listingCount: z.number().int(),
    }),
  ),
  bases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      locationName: z.string(),
      regionId: z.string(),
      regionName: z.string(),
      countryId: z.string(),
      countryName: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      /** Published listings homed here. The client starts from the biggest, so this orders. */
      listingCount: z.number().int(),
    }),
  ),
});
