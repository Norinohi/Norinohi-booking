import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import popularRoutesJson from "./popular-routes.json" with { type: "json" };

import type * as schema from "./schema/index";
import { base, country, location, region } from "./schema/geography";
import { suggestedRoute, suggestedRouteStop, suggestedRouteTranslation } from "./schema/route";

type Database = NodePgDatabase<typeof schema>;
type Locale = "en" | "uk" | "de" | "es";
const LOCALES: Locale[] = ["en", "uk", "de", "es"];
type Copy = { title: string; description: string };

const copySchema = z.object({ title: z.string(), description: z.string() });

/*
 * Where a route is anchored. A region is preferred because the home page card then links with the
 * sailing-area filter; a base only where the catalogue has no region at that grain (Göcek sits in
 * "Aegean", Lofoten in "Northern Europe"). Looked up by name rather than id, because ids are minted
 * per environment by the sync and the names are the vendors' own on every one of them.
 */
type Target =
  | { kind: "region"; country: string; names: string[] }
  | { kind: "base"; country: string; names: string[] };

type SeedRoute = {
  id: string;
  target: Target;
  nights: number;
  difficulty: "easy" | "moderate" | "advanced";
  imageUrl: string | null;
  copy: Record<Locale, Copy>;
  stops: { name: string; lat: number; lng: number }[];
};

/**
 * The client's popular sailing routes, in their order: the first six fill the home page slider,
 * all of them the "View All Popular" grid.
 *
 * Harbour positions are public marina and anchorage coordinates. The copy is a first draft for the
 * client to edit on /routes, which is why a re-run never overwrites a route that already exists.
 */
export const POPULAR_ROUTES: SeedRoute[] = z
  .array(
    z.object({
      id: z.string(),
      target: z.object({
        kind: z.enum(["region", "base"]),
        country: z.string(),
        names: z.array(z.string()),
      }),
      nights: z.number().int().positive(),
      difficulty: z.enum(["easy", "moderate", "advanced"]),
      imageUrl: z.string().nullable(),
      copy: z.object({ en: copySchema, uk: copySchema, de: copySchema, es: copySchema }),
      stops: z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number() })),
    }),
  )
  .parse(popularRoutesJson);

export type PopularRoutesPlan = {
  created: { id: string; title: string; target: string }[];
  existing: { id: string; title: string }[];
  /** Existing routes whose title and description are rewritten from the seed, under `refreshCopy`. */
  refreshed: { id: string; title: string }[];
  unresolved: { id: string; title: string; target: string }[];
  /** Routes featured today that the new order leaves out, so a hand-curated one is not lost silently. */
  unfeatured: { id: string; title: string }[];
};

async function resolveTarget(db: Database, target: Target) {
  for (const name of target.names) {
    if (target.kind === "region") {
      const [row] = await db
        .select({ id: region.id })
        .from(region)
        .innerJoin(country, eq(country.id, region.countryId))
        .where(and(eq(country.name, target.country), eq(region.name, name)))
        .limit(1);
      if (row) return { baseId: null, regionId: row.id, label: `region ${name}` };
    } else {
      const [row] = await db
        .select({ id: base.id })
        .from(base)
        .innerJoin(location, eq(location.id, base.locationId))
        .innerJoin(region, eq(region.id, location.regionId))
        .innerJoin(country, eq(country.id, region.countryId))
        .where(and(eq(country.name, target.country), eq(base.name, name)))
        .limit(1);
      if (row) return { baseId: row.id, regionId: null, label: `base ${name}` };
    }
  }
  return null;
}

/**
 * Creates the routes that are missing, then makes them the featured list in the client's order.
 *
 * An existing route is left exactly as it is, copy, stops and image included: after the first run
 * the routes belong to the editors on /routes, and a re-run is only ever for putting the order
 * back. A route whose region or base the environment does not have is skipped and reported rather
 * than anchored somewhere approximate.
 *
 * `refreshCopy` is the one exception: it overwrites the title and description of existing routes, in
 * every locale, with the seed's copy, for when the client sends a new text for the whole list. Stops,
 * image, target and order stay as the editors left them.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedPopularRoutes(
  db: Database,
  { apply, refreshCopy = false }: { apply: boolean; refreshCopy?: boolean },
): Promise<PopularRoutesPlan> {
  const plan: PopularRoutesPlan = {
    created: [],
    existing: [],
    refreshed: [],
    unresolved: [],
    unfeatured: [],
  };

  const ids = POPULAR_ROUTES.map((route) => route.id);
  const existingRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  const existing = new Set(existingRows.map((row) => row.id));

  const toCreate: { route: SeedRoute; baseId: string | null; regionId: string | null }[] = [];
  for (const route of POPULAR_ROUTES) {
    if (existing.has(route.id)) {
      const entry = { id: route.id, title: route.copy.en.title };
      (refreshCopy ? plan.refreshed : plan.existing).push(entry);
      continue;
    }
    const target = await resolveTarget(db, route.target);
    const wanted = `${route.target.kind} ${route.target.names.join(" | ")} (${route.target.country})`;
    if (!target) {
      plan.unresolved.push({ id: route.id, title: route.copy.en.title, target: wanted });
      continue;
    }
    plan.created.push({ id: route.id, title: route.copy.en.title, target: target.label });
    toCreate.push({ route, baseId: target.baseId, regionId: target.regionId });
  }

  const ordered = POPULAR_ROUTES.filter(
    (route) => existing.has(route.id) || toCreate.some((item) => item.route.id === route.id),
  ).map((route) => route.id);

  plan.unfeatured = await db
    .select({ id: suggestedRoute.id, title: suggestedRoute.title })
    .from(suggestedRoute)
    .where(
      and(
        isNotNull(suggestedRoute.featuredRank),
        ordered.length > 0 ? notInArray(suggestedRoute.id, ordered) : sql`true`,
      ),
    );

  if (!apply) return plan;

  await db.transaction(async (tx) => {
    for (const { route, baseId, regionId } of toCreate) {
      await tx.insert(suggestedRoute).values({
        id: route.id,
        baseId,
        regionId,
        title: route.copy.en.title,
        description: route.copy.en.description,
        kind: "seven_days",
        nights: route.nights,
        difficulty: route.difficulty,
        imageUrl: route.imageUrl,
        active: true,
      });

      await tx.insert(suggestedRouteTranslation).values(
        LOCALES.map((locale) => ({
          routeId: route.id,
          locale,
          title: route.copy[locale].title,
          description: route.copy[locale].description,
        })),
      );

      await tx.insert(suggestedRouteStop).values(
        route.stops.map((stop, index) => ({
          routeId: route.id,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          sortOrder: index,
        })),
      );
    }

    for (const { id } of plan.refreshed) {
      const route = POPULAR_ROUTES.find((candidate) => candidate.id === id);
      if (!route) continue;

      await tx
        .update(suggestedRoute)
        .set({ title: route.copy.en.title, description: route.copy.en.description })
        .where(eq(suggestedRoute.id, id));

      await tx
        .insert(suggestedRouteTranslation)
        .values(
          LOCALES.map((locale) => ({
            routeId: id,
            locale,
            title: route.copy[locale].title,
            description: route.copy[locale].description,
          })),
        )
        .onConflictDoUpdate({
          target: [suggestedRouteTranslation.routeId, suggestedRouteTranslation.locale],
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
          },
        });
    }

    await tx
      .update(suggestedRoute)
      .set({ featuredRank: null })
      .where(isNotNull(suggestedRoute.featuredRank));

    for (const [index, id] of ordered.entries()) {
      await tx
        .update(suggestedRoute)
        .set({ featuredRank: index + 1 })
        .where(eq(suggestedRoute.id, id));
    }
  });

  return plan;
}
