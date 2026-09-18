import { z } from "zod";

import { popularYachtsConfigSchema } from "./admin";
import { listingSummarySchema } from "./catalog";
import { faqCacheSchema } from "./faq";

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

/** A save from the admin screen: what was stored, and whether the home page cache was dropped. */
export const popularYachtsConfigSavedSchema = z.object({
  config: popularYachtsConfigSchema,
  cache: faqCacheSchema,
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
  /** The route's public address, `/routes/<slug>`. */
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  nights: z.number().int(),
  kind: z.enum(["seven_days", "fourteen_days", "family", "first_time_sailors", "active_sailing"]),
  difficulty: z.enum(["easy", "moderate", "advanced"]).nullable(),
  imageUrl: z.string().nullable(),
  cloudinaryId: z.string().nullable(),
  /** "Dalmatia · Croatia" -- the place a card names under its title. */
  placeLabel: z.string(),
  /** The country a card's link filters the catalogue by. Null where the target has no country. */
  countryValue: z.string().nullable(),
  /** The country in the requested language, for the label on the card's photo. */
  countryLabel: z.string().nullable(),
  /** The sailing area a card's link filters the catalogue by, as a search filter value. */
  sailingAreaValue: z.string().nullable(),
  /** The base a card's link filters the catalogue by, for a route that starts from one. */
  marinaValue: z.string().nullable(),
  stops: z.array(popularRouteStopSchema),
});

export const popularRoutesInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const popularRoutesSchema = z.object({
  routes: z.array(popularRouteSchema),
});

export const routesMapInputSchema = z.object({
  locale: z.string().min(2).max(10).optional(),
});

export const routeMarinasInputSchema = z.object({
  routeId: z.string().min(1).max(64),
});

export const routeMarinaSchema = z.object({
  name: z.string(),
  /** The marina's key: the filter value of the name it is shown under. */
  value: z.string(),
  /** Every name its bases are filed under, as filter values, so a catalogue link finds them all. */
  values: z.array(z.string()),
  lat: z.number(),
  lng: z.number(),
  /** From `nearStop`, the stop of the itinerary this marina is closest to. */
  distanceKm: z.number(),
  nearStop: z.string(),
  listingCount: z.number().int(),
});

export const routeMarinasSchema = z.object({
  marinas: z.array(routeMarinaSchema),
});
