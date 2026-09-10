import { z } from "zod";

import { popularYachtsConfigSchema } from "./admin";
import { listingSummarySchema } from "./catalog";

export const popularYachtsInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  currency: z.string().length(3).optional(),
  /**
   * Rotates the selection, and rides in the caller's cache key. Omitted, the server buckets the
   * clock by the day, so the slider turns over once a day rather than once a request -- an
   * unstable value inside a cached read is what breaks a prerender.
   */
  seed: z.coerce.number().int().optional(),
});

export const popularYachtsSchema = z.object({
  items: z.array(listingSummarySchema),
  /** The configuration the selection was made under, so a caller can say why it looks as it does. */
  config: popularYachtsConfigSchema,
});

/* --------------------------------------------------------------- popular routes */

export const popularRouteStopSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  note: z.string().nullable(),
});

export const popularRouteSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  nights: z.number().int(),
  difficulty: z.enum(["easy", "moderate", "advanced"]).nullable(),
  imageUrl: z.string().nullable(),
  cloudinaryId: z.string().nullable(),
  /** "Dalmatia · Croatia" -- the place a card names under its title. */
  placeLabel: z.string(),
  /** The country a card's link filters the catalogue by. Null where the target has no country. */
  countryValue: z.string().nullable(),
  stops: z.array(popularRouteStopSchema),
});

export const popularRoutesInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const popularRoutesSchema = z.object({
  routes: z.array(popularRouteSchema),
});
