import { listNearestBases } from "@yacht-charter/db/geo/nearest-marinas";
import { z } from "zod";

import { defineTool } from "./tool";

export const MAX_NEAREST_LIMIT = 50;
export const MAX_NEAREST_KM = 500;

export const nearestMarinasInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  limit: z.number().int().positive().max(MAX_NEAREST_LIMIT).default(10),
  maxKm: z.number().positive().max(MAX_NEAREST_KM).default(100),
  onlyWithListings: z.boolean().default(true),
});

export const nearestMarinasOutputSchema = z.object({
  marinas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      location: z.string(),
      city: z.string().nullable(),
      region: z.string(),
      country: z.string(),
      countryCode: z.string(),
      lat: z.number(),
      lng: z.number(),
      distanceKm: z.number(),
      listingCount: z.number().int(),
    }),
  ),
});

export const nearestMarinas = defineTool({
  name: "nearestMarinas",
  description:
    "Find the charter bases (marinas) closest to a coordinate, nearest first, within maxKm (at most 500) and up to limit results (at most 50). Each carries its distance in kilometres and how many catalogue yachts sail from it. By default only bases with yachts are returned.",
  input: nearestMarinasInputSchema,
  output: nearestMarinasOutputSchema,
  run: async (ctx, input) => ({ marinas: await listNearestBases(ctx.db, input) }),
});
