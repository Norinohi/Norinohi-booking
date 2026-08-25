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

export const routeStopSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  sortOrder: z.number().int(),
  note: z.string().nullable(),
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
  kind: suggestedRouteKindSchema,
  nights: z.number().int(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
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
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

export const routeListSchema = paginatedSchema(routeSchema);

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
  kind: suggestedRouteKindSchema,
  /* A charter is sold in nights; two weeks is the longest itinerary the client writes. */
  nights: z.number().int().min(1).max(28),
  description: z.string().trim().max(4000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
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

export const routeStopCreateInputSchema = z.object({
  routeId: idSchema,
  name: z.string().trim().min(1).max(200),
  lat: latSchema,
  lng: lngSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

export const routeStopUpdateInputSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(200).optional(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
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
