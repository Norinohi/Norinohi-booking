import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";

import type * as schema from "../schema";
import { base, country, location, region } from "../schema/geography";
import {
  suggestedRoute,
  suggestedRouteKind,
  suggestedRouteStop,
  suggestedRouteStopTranslation,
  suggestedRouteTranslation,
} from "../schema/route";
import { routeSlug, uniqueSlug } from "./route-slug";

type Database = NodePgDatabase<typeof schema>;
type DatabaseExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type SuggestedRouteKind = (typeof suggestedRouteKind)["enumValues"][number];

/*
 * A route hangs off a base or off a region, and the two reach their country by different paths -
 * base -> location -> region -> country against region -> country. Both are joined on every read
 * so the target reads as one label wherever it came from, which is also what the country filter
 * has to match against.
 */
const baseRegion = alias(region, "base_region");
const baseCountry = alias(country, "base_country");
const regionCountry = alias(country, "region_country");

const targetSelection = {
  route: suggestedRoute,
  baseName: base.name,
  baseLat: base.lat,
  baseLng: base.lng,
  locationName: location.name,
  baseRegionName: baseRegion.name,
  baseCountryName: baseCountry.name,
  regionName: region.name,
  regionCountryName: regionCountry.name,
};

export type RouteTargetRow = {
  route: typeof suggestedRoute.$inferSelect;
  baseName: string | null;
  baseLat: number | null;
  baseLng: number | null;
  locationName: string | null;
  baseRegionName: string | null;
  baseCountryName: string | null;
  regionName: string | null;
  regionCountryName: string | null;
};

export type RouteTargetFilter = {
  query?: string;
  kind?: SuggestedRouteKind;
  active?: boolean;
  countryId?: string;
};

function targetWhere(filter: RouteTargetFilter): SQL | undefined {
  const filters = [];
  if (filter.query) filters.push(ilike(suggestedRoute.title, `%${filter.query}%`));
  if (filter.kind) filters.push(eq(suggestedRoute.kind, filter.kind));
  if (filter.active !== undefined) filters.push(eq(suggestedRoute.active, filter.active));
  if (filter.countryId) {
    filters.push(or(eq(baseCountry.id, filter.countryId), eq(regionCountry.id, filter.countryId)));
  }
  return filters.length > 0 ? and(...filters) : undefined;
}

export function listRouteTargets(
  db: Database,
  filter: RouteTargetFilter,
  limit: number,
  offset: number,
): Promise<RouteTargetRow[]> {
  return db
    .select(targetSelection)
    .from(suggestedRoute)
    .leftJoin(base, eq(base.id, suggestedRoute.baseId))
    .leftJoin(location, eq(location.id, base.locationId))
    .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
    .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
    .leftJoin(region, eq(region.id, suggestedRoute.regionId))
    .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
    .where(targetWhere(filter))
    .orderBy(asc(suggestedRoute.sortOrder), desc(suggestedRoute.createdAt))
    .limit(limit)
    .offset(offset);
}

export function countRouteTargets(
  db: Database,
  filter: RouteTargetFilter,
): Promise<{ totalItems: number }[]> {
  return db
    .select({ totalItems: count() })
    .from(suggestedRoute)
    .leftJoin(base, eq(base.id, suggestedRoute.baseId))
    .leftJoin(location, eq(location.id, base.locationId))
    .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
    .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
    .leftJoin(region, eq(region.id, suggestedRoute.regionId))
    .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
    .where(targetWhere(filter));
}

export async function findRouteTarget(db: Database, id: string): Promise<RouteTargetRow | null> {
  const [row] = await db
    .select(targetSelection)
    .from(suggestedRoute)
    .leftJoin(base, eq(base.id, suggestedRoute.baseId))
    .leftJoin(location, eq(location.id, base.locationId))
    .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
    .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
    .leftJoin(region, eq(region.id, suggestedRoute.regionId))
    .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
    .where(eq(suggestedRoute.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Inactive routes are excluded rather than merely sorted last: `active` is what "this route has
 * stops and may be shown" means, and a featured draft would be a card linking to an empty
 * itinerary.
 */
export function listFeaturedRouteTargets(db: Database): Promise<RouteTargetRow[]> {
  return db
    .select(targetSelection)
    .from(suggestedRoute)
    .leftJoin(base, eq(base.id, suggestedRoute.baseId))
    .leftJoin(location, eq(location.id, base.locationId))
    .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
    .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
    .leftJoin(region, eq(region.id, suggestedRoute.regionId))
    .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
    .where(and(isNotNull(suggestedRoute.featuredRank), eq(suggestedRoute.active, true)))
    .orderBy(asc(suggestedRoute.featuredRank));
}

export async function listExistingRouteIds(db: Database, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: suggestedRoute.id })
    .from(suggestedRoute)
    .where(inArray(suggestedRoute.id, ids));
  return rows.map((row) => row.id);
}

export async function baseExists(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: base.id }).from(base).where(eq(base.id, id)).limit(1);
  return row !== undefined;
}

export async function regionExists(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: region.id }).from(region).where(eq(region.id, id)).limit(1);
  return row !== undefined;
}

/*
 * Read alongside the stops rather than joined onto the target query: a route has up to four
 * translation rows and up to a couple of dozen stops, and joining both would multiply them
 * against each other for no gain.
 */
export function listRouteTranslationRows(db: Database, routeIds: string[]) {
  return db
    .select()
    .from(suggestedRouteTranslation)
    .where(inArray(suggestedRouteTranslation.routeId, routeIds))
    .orderBy(asc(suggestedRouteTranslation.locale));
}

export function listRouteStopRows(db: Database, routeIds: string[]) {
  return db
    .select()
    .from(suggestedRouteStop)
    .where(inArray(suggestedRouteStop.routeId, routeIds))
    .orderBy(asc(suggestedRouteStop.sortOrder));
}

export function listStopNoteRows(db: Database, stopIds: string[]) {
  return db
    .select()
    .from(suggestedRouteStopTranslation)
    .where(inArray(suggestedRouteStopTranslation.stopId, stopIds));
}

export async function findRouteStop(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(suggestedRouteStop)
    .where(eq(suggestedRouteStop.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Writes the locales the caller named, leaving the rest alone.
 *
 * A locale whose title and description are both empty is deleted rather than stored blank:
 * "no copy in German" and "German copy that says nothing" are the same thing to the read, and
 * keeping only one of them means `missingLocales` can be trusted.
 */
export async function writeRouteTranslations(
  tx: DatabaseExecutor,
  routeId: string,
  entries: { locale: string; title?: string | null; description?: string | null }[],
): Promise<void> {
  for (const entry of entries) {
    const title = entry.title?.trim() || null;
    const description = entry.description?.trim() || null;

    if (title === null && description === null) {
      await tx
        .delete(suggestedRouteTranslation)
        .where(
          and(
            eq(suggestedRouteTranslation.routeId, routeId),
            eq(suggestedRouteTranslation.locale, entry.locale),
          ),
        );
      continue;
    }

    await tx
      .insert(suggestedRouteTranslation)
      .values({ routeId, locale: entry.locale, title, description })
      .onConflictDoUpdate({
        target: [suggestedRouteTranslation.routeId, suggestedRouteTranslation.locale],
        set: { title, description, updatedAt: new Date() },
      });
  }
}

/**
 * Writes the stop notes the caller named, leaving the rest alone.
 *
 * An empty note is deleted rather than stored blank, for the reason `writeRouteTranslations`
 * gives: the read falls back to the stop's English note either way, so a blank row would only
 * make `missingNoteLocales` lie.
 */
export async function writeRouteStopNotes(
  tx: DatabaseExecutor,
  stopId: string,
  entries: { locale: string; note?: string | null }[],
): Promise<void> {
  for (const entry of entries) {
    const note = entry.note?.trim() || null;

    if (note === null) {
      await tx
        .delete(suggestedRouteStopTranslation)
        .where(
          and(
            eq(suggestedRouteStopTranslation.stopId, stopId),
            eq(suggestedRouteStopTranslation.locale, entry.locale),
          ),
        );
      continue;
    }

    await tx
      .insert(suggestedRouteStopTranslation)
      .values({ stopId, locale: entry.locale, note })
      .onConflictDoUpdate({
        target: [suggestedRouteStopTranslation.stopId, suggestedRouteStopTranslation.locale],
        set: { note, updatedAt: new Date() },
      });
  }
}

/**
 * A free address for a new route titled `title`: its slug, or the slug numbered from 2 when an
 * earlier route already holds it. Read inside the transaction that inserts, so two routes created
 * in one run cannot both take the same one; `suggested_route_slug_uq` catches two runs racing.
 */
export async function freeRouteSlug(db: DatabaseExecutor, title: string): Promise<string> {
  const base = routeSlug(title);
  const rows = await db
    .select({ slug: suggestedRoute.slug })
    .from(suggestedRoute)
    .where(or(eq(suggestedRoute.slug, base), ilike(suggestedRoute.slug, `${base}-%`)));
  return uniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

/** Appends: `suggested_route_stop_order_uq` means the new row cannot reuse an existing slot. */
export async function nextRouteStopSortOrder(
  db: DatabaseExecutor,
  routeId: string,
): Promise<number> {
  const [row] = await db
    .select({ highest: sql<number | null>`max(${suggestedRouteStop.sortOrder})` })
    .from(suggestedRouteStop)
    .where(eq(suggestedRouteStop.routeId, routeId));

  return (row?.highest ?? -1) + 1;
}

/**
 * Writes positions 0..n-1 in two passes.
 *
 * `suggested_route_stop_order_uq` is a plain unique index, not a deferrable constraint, so it is
 * enforced per statement: moving stop 3 to slot 1 while stop 1 still holds it fails immediately.
 * The first pass parks every row on a negative slot, which nothing else can occupy, and the
 * second lays them down in order.
 */
export async function renumberRouteStops(
  tx: DatabaseExecutor,
  orderedIds: string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await tx
      .update(suggestedRouteStop)
      .set({ sortOrder: -(index + 1) })
      .where(eq(suggestedRouteStop.id, id));
  }

  for (const [index, id] of orderedIds.entries()) {
    await tx
      .update(suggestedRouteStop)
      .set({ sortOrder: index })
      .where(eq(suggestedRouteStop.id, id));
  }
}
