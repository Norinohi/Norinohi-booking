import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import catalogueRoutesJson from "./catalogue-routes.json" with { type: "json" };
import stopRefreshJson from "./catalogue-stop-refresh.json" with { type: "json" };

import type * as schema from "./schema/index";
import { base, country, region } from "./schema/geography";
import { listing } from "./schema/listing";
import {
  suggestedRoute,
  suggestedRouteStop,
  suggestedRouteStopTranslation,
  suggestedRouteTranslation,
} from "./schema/route";

type Database = NodePgDatabase<typeof schema>;
type Locale = "en" | "uk" | "de" | "es";
const LOCALES: Locale[] = ["en", "uk", "de", "es"];
type Copy = { title: string; description: string };

/**
 * How far from a route's first stop a charter base may sit and still be its starting marina.
 *
 * Tight on purpose. At 60 km the Seychelles route that starts at Praslin resolved to Eden Island
 * on Mahé, 46 km and a different island away -- the client's own note on that route reads "publish
 * only where there are yachts actually based at Praslin; do not attach it to Mahé". Every other
 * route resolves within 16 km, so nothing else rides on the difference.
 */
const BASE_RADIUS_KM = 25;

type SeedStop = {
  name: string;
  lat: number;
  lng: number;
  /** The line a card prints under "Day 3 - Vis", in every language the site has. */
  note: Record<Locale, string>;
};

type SeedRoute = {
  id: string;
  difficulty: "easy" | "moderate" | "advanced";
  /*
   * Created unpublished, because the client's file marks it as needing an operational check --
   * distance, overnight stops or base availability. It shows on /routes with everything else and
   * reaches the site the moment someone publishes it there.
   */
  draft?: boolean;
  /*
   * Where to anchor a route whose start has no base within `BASE_RADIUS_KM`. Only three have one;
   * the rest resolve to a marina, which is the better link because it filters to boats that
   * actually start there.
   */
  fallbackRegion?: { country: string; names: string[] };
  copy: Record<Locale, Copy>;
  stops: SeedStop[];
};

/** The last day of a round trip returns to the marina the first one checked in at. */
export const RETURN_NOTE = {
  en: "Back at the base: the boat is handed over in the morning.",
  uk: "Повернення на базу: яхту здають уранці.",
  de: "Zurück an der Basis: Das Boot wird am Morgen übergeben.",
  es: "De vuelta en la base: el barco se entrega por la mañana.",
} satisfies Record<Locale, string>;

const copySchema = z.object({ title: z.string(), description: z.string() });

const seedStopSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  note: z.object({ en: z.string(), uk: z.string(), de: z.string(), es: z.string() }),
});

const seedRouteSchema = z.object({
  id: z.string(),
  difficulty: z.enum(["easy", "moderate", "advanced"]),
  draft: z.boolean().optional(),
  fallbackRegion: z.object({ country: z.string(), names: z.array(z.string()) }).optional(),
  copy: z.object({ en: copySchema, uk: copySchema, de: copySchema, es: copySchema }),
  stops: z.array(seedStopSchema),
});

/**
 * The client's 60-route list (CharterNavi_Popular_Routes.txt), minus the twelve that already exist
 * as the home page's featured routes -- those keep their copy and their target and only have their
 * stops refreshed, through `STOP_REFRESH` below.
 *
 * Stop positions are marina and anchorage coordinates from that file. The copy is a first draft for
 * the client to edit on /routes, which is why a re-run never touches a route that already exists.
 * A draft route's `$comment` in `catalogue-routes.json` is the client's reason it needs checking.
 */
export const CATALOGUE_ROUTES: SeedRoute[] = z.array(seedRouteSchema).parse(catalogueRoutesJson);

/**
 * The twelve featured routes, whose itineraries the client's file restates. Their titles,
 * descriptions and targets are left alone: only the stops are replaced.
 */
export const STOP_REFRESH: { routeId: string; stops: SeedStop[] }[] = z
  .array(z.object({ routeId: z.string(), stops: z.array(seedStopSchema) }))
  .parse(stopRefreshJson);

/*
 * Every stop the seed has words for, by place name.
 *
 * A name that carries two places ("Kefalonia/Fiskardo") is filed under both, so a hand-written
 * stop that names only one of them still finds it. A place two routes describe differently is
 * dropped rather than guessed at -- the backfill wants one answer, not the first of several.
 */
function stopNoteLookup(): Map<string, Record<Locale, string> | null> {
  const lookup = new Map<string, Record<Locale, string> | null>();
  /* Without the last stop of each route: it carries the note about handing the boat back, which
     says nothing about the place and would collide with that same marina's arrival note. */
  const stops = [
    ...CATALOGUE_ROUTES.flatMap((route) => route.stops.slice(0, -1)),
    ...STOP_REFRESH.flatMap((entry) => entry.stops.slice(0, -1)),
  ];

  for (const stop of stops) {
    for (const alias of stop.name.split("/")) {
      const key = normalizeName(alias);
      if (!key) continue;
      const seen = lookup.get(key);
      if (seen === undefined) {
        lookup.set(key, stop.note);
        continue;
      }
      if (seen === null || seen.en !== stop.note.en) lookup.set(key, null);
    }
  }

  return lookup;
}

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Names a stop the seed does not own: one on a route staff wrote by hand.
 *
 * Matched on the place inside the name, because those routes are written the way a sailor says it
 * -- "ACI Marina Split", "Maslinica, Šolta" -- while this file names the island. A stop whose name
 * carries no place the seed knows, or several, is left alone and reported: a plausible wrong line
 * under a day is worse than a blank one.
 */
function matchNote(lookup: Map<string, Record<Locale, string> | null>, stopName: string) {
  const words = normalizeName(stopName);
  if (!words) return null;

  const direct = lookup.get(words);
  if (direct) return direct;

  const spoken = new Set(words.split(" "));
  const hits: Record<Locale, string>[] = [];
  for (const [key, note] of lookup) {
    if (!note) continue;
    /*
     * The place named inside the stop's own name: "ACI Marina Split" is Split, "Palmižana,
     * Pakleni" is the Pakleni islands. Words of three letters or fewer are ignored, because they
     * are the ones that collide ("Bol" is a town, "bay" and "isla" are not names at all).
     */
    if (key.split(" ").some((word) => word.length > 3 && spoken.has(word))) hits.push(note);
  }

  const [first] = hits;
  if (!first) return null;
  return hits.every((note) => note.en === first.en) ? first : null;
}

/**
 * Writes a route's stops and their per-locale notes.
 *
 * English lives on the stop row itself, which is what the read falls back to; the other three go in
 * `suggested_route_stop_translation`. The insert returns the ids rather than reading them back,
 * because a stop is identified by nothing but its route and position.
 */
async function writeStops(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  routeId: string,
  stops: SeedStop[],
) {
  if (stops.length === 0) return;

  const inserted = await tx
    .insert(suggestedRouteStop)
    .values(
      stops.map((stop, index) => ({
        routeId,
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        sortOrder: index,
        note: stop.note.en,
      })),
    )
    .returning({ id: suggestedRouteStop.id, sortOrder: suggestedRouteStop.sortOrder });

  const rows = inserted.flatMap((row) => {
    const stop = stops[row.sortOrder];
    if (!stop) return [];
    return LOCALES.filter((locale) => locale !== "en").map((locale) => ({
      stopId: row.id,
      locale,
      note: stop.note[locale],
    }));
  });
  if (rows.length > 0) await tx.insert(suggestedRouteStopTranslation).values(rows);
}

export type CatalogueRoutesPlan = {
  /** Stops on routes this seed does not own that it could still name, and the ones it could not. */
  backfilled: { routeTitle: string; stop: string }[];
  unnamed: { routeTitle: string; stop: string }[];
  created: { id: string; title: string; target: string; draft: boolean }[];
  existing: { id: string; title: string }[];
  unresolved: { id: string; title: string }[];
  stopsRefreshed: { routeId: string; stops: number }[];
  /** Routes in STOP_REFRESH that this database does not have, so nothing was refreshed for them. */
  missingRefreshTargets: string[];
};

/**
 * The charter base a route starts from: the nearest one to its first stop that still has published
 * listings, within `BASE_RADIUS_KM`.
 *
 * By position rather than by name because the two vendors spell the same marina differently
 * ("Göcek Mucev Marina", "Göcek/D-Marin") and mint their ids per environment, while the client's
 * file names the town. A base with no listings left is skipped: the card's link would find nothing.
 */
async function resolveBase(db: Database, stop: { lat: number; lng: number }) {
  /* Equirectangular distance in km, good enough at this scale and indexable-free. */
  const distanceKm = sql<number>`
    111.045 * sqrt(
      power(${base.lat} - ${stop.lat}, 2)
      + power((${base.lng} - ${stop.lng}) * cos(radians(${stop.lat})), 2)
    )`;
  const [row] = await db
    .select({ id: base.id, name: base.name, km: distanceKm })
    .from(base)
    .innerJoin(listing, and(eq(listing.homeBaseId, base.id), eq(listing.status, "published")))
    .where(
      sql`${base.lat} is not null and ${base.lng} is not null and ${distanceKm} <= ${BASE_RADIUS_KM}`,
    )
    .groupBy(base.id, base.name, base.lat, base.lng)
    .orderBy(distanceKm)
    .limit(1);
  return row ?? null;
}

async function resolveRegion(db: Database, target: { country: string; names: string[] }) {
  for (const name of target.names) {
    const [row] = await db
      .select({ id: region.id, name: region.name })
      .from(region)
      .innerJoin(country, eq(country.id, region.countryId))
      .where(and(eq(country.name, target.country), eq(region.name, name)))
      .limit(1);
    if (row) return row;
  }
  return null;
}

/**
 * Creates the client's routes that are missing and refreshes the featured twelve's stops.
 *
 * Every new route is published (`active`) but unfeatured: the home page keeps the twelve it has,
 * and staff pick from /routes what else belongs there. An existing route is left exactly as it is,
 * copy and target included -- after the first run the routes belong to the editors.
 *
 * A route whose start has no charter base within `BASE_RADIUS_KM` and no fallback region is
 * reported rather than anchored somewhere approximate: the schema requires exactly one of the two.
 *
 * Nothing is written unless `apply` is set.
 */
export async function seedCatalogueRoutes(
  db: Database,
  { apply }: { apply: boolean },
): Promise<CatalogueRoutesPlan> {
  const plan: CatalogueRoutesPlan = {
    backfilled: [],
    unnamed: [],
    created: [],
    existing: [],
    unresolved: [],
    stopsRefreshed: [],
    missingRefreshTargets: [],
  };

  const ids = CATALOGUE_ROUTES.map((route) => route.id);
  const existingRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  const existing = new Set(existingRows.map((row) => row.id));

  const toCreate: { route: SeedRoute; baseId: string | null; regionId: string | null }[] = [];
  for (const route of CATALOGUE_ROUTES) {
    if (existing.has(route.id)) {
      plan.existing.push({ id: route.id, title: route.copy.en.title });
      continue;
    }
    const first = route.stops[0];
    const nearest = first ? await resolveBase(db, first) : null;
    if (nearest) {
      plan.created.push({
        id: route.id,
        title: route.copy.en.title,
        target: `base ${nearest.name} (${Math.round(nearest.km)} km)`,
        draft: route.draft === true,
      });
      toCreate.push({ route, baseId: nearest.id, regionId: null });
      continue;
    }
    const fallback = route.fallbackRegion ? await resolveRegion(db, route.fallbackRegion) : null;
    if (!fallback) {
      plan.unresolved.push({ id: route.id, title: route.copy.en.title });
      continue;
    }
    plan.created.push({
      id: route.id,
      title: route.copy.en.title,
      target: `region ${fallback.name}`,
      draft: route.draft === true,
    });
    toCreate.push({ route, baseId: null, regionId: fallback.id });
  }

  const refreshIds = STOP_REFRESH.map((entry) => entry.routeId);
  const presentRows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, refreshIds));
  const present = new Set(presentRows.map((row) => row.id));
  for (const entry of STOP_REFRESH) {
    if (present.has(entry.routeId)) {
      plan.stopsRefreshed.push({ routeId: entry.routeId, stops: entry.stops.length });
    } else {
      plan.missingRefreshTargets.push(entry.routeId);
    }
  }

  /*
   * Stops with no words under them, on routes this seed does not own. The client's list is only
   * part of what /routes holds: the rest was written by hand, and a card there prints a bare
   * "Day 3 - Vis" with nothing beneath it.
   */
  const ownIds = new Set([...ids, ...refreshIds]);
  const orphanStops = await db
    .select({
      id: suggestedRouteStop.id,
      routeId: suggestedRouteStop.routeId,
      name: suggestedRouteStop.name,
      sortOrder: suggestedRouteStop.sortOrder,
      routeTitle: suggestedRoute.title,
    })
    .from(suggestedRouteStop)
    .innerJoin(suggestedRoute, eq(suggestedRoute.id, suggestedRouteStop.routeId))
    .where(sql`coalesce(nullif(trim(${suggestedRouteStop.note}), ''), null) is null`);

  /* Which stop opens and which closes each of those routes, so a round trip's last day reads as
     the return rather than as a second check-in at the same marina. */
  const ends = new Map<string, { first: string; last: number }>();
  const orphanRouteIds = [...new Set(orphanStops.map((stop) => stop.routeId))].filter(
    (routeId) => !ownIds.has(routeId),
  );
  if (orphanRouteIds.length > 0) {
    const rows = await db
      .select({
        routeId: suggestedRouteStop.routeId,
        name: suggestedRouteStop.name,
        sortOrder: suggestedRouteStop.sortOrder,
      })
      .from(suggestedRouteStop)
      .where(inArray(suggestedRouteStop.routeId, orphanRouteIds));

    for (const row of rows) {
      const seen = ends.get(row.routeId);
      if (!seen) {
        ends.set(row.routeId, { first: row.name, last: row.sortOrder });
        continue;
      }
      if (row.sortOrder > seen.last) seen.last = row.sortOrder;
      if (row.sortOrder === 0) seen.first = row.name;
    }
  }

  const lookup = stopNoteLookup();
  const toName: { id: string; note: Record<Locale, string> }[] = [];
  for (const stop of orphanStops) {
    /* The seed rewrites its own routes' stops above, notes included. */
    if (ownIds.has(stop.routeId)) continue;

    const route = ends.get(stop.routeId);
    const returning =
      route !== undefined &&
      stop.sortOrder === route.last &&
      stop.sortOrder > 0 &&
      stop.name === route.first;
    const note = returning ? RETURN_NOTE : matchNote(lookup, stop.name);
    if (!note) {
      plan.unnamed.push({ routeTitle: stop.routeTitle, stop: stop.name });
      continue;
    }
    plan.backfilled.push({ routeTitle: stop.routeTitle, stop: stop.name });
    toName.push({ id: stop.id, note });
  }

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
        nights: 7,
        difficulty: route.difficulty,
        /* A route the client flagged for an operational check is created unpublished. */
        active: route.draft !== true,
      });

      await tx.insert(suggestedRouteTranslation).values(
        LOCALES.map((locale) => ({
          routeId: route.id,
          locale,
          title: route.copy[locale].title,
          description: route.copy[locale].description,
        })),
      );

      await writeStops(tx, route.id, route.stops);
    }

    for (const entry of STOP_REFRESH) {
      if (!present.has(entry.routeId)) continue;
      await tx.delete(suggestedRouteStop).where(eq(suggestedRouteStop.routeId, entry.routeId));
      await writeStops(tx, entry.routeId, entry.stops);
    }

    for (const { id, note } of toName) {
      await tx
        .update(suggestedRouteStop)
        .set({ note: note.en })
        .where(eq(suggestedRouteStop.id, id));

      await tx
        .insert(suggestedRouteStopTranslation)
        .values(
          LOCALES.filter((locale) => locale !== "en").map((locale) => ({
            stopId: id,
            locale,
            note: note[locale],
          })),
        )
        .onConflictDoUpdate({
          target: [suggestedRouteStopTranslation.stopId, suggestedRouteStopTranslation.locale],
          set: { note: sql`excluded.note`, updatedAt: new Date() },
        });
    }
  });

  return plan;
}
