import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { SITE_LOCALES, type SiteLocale, TRANSLATED_LOCALES } from "../locales";
import type * as schema from "../schema/index";
import {
  suggestedRouteStop,
  suggestedRouteStopTranslation,
  suggestedRouteTranslation,
} from "../schema/route";

type Database = NodePgDatabase<typeof schema>;

export type SeededRouteCopy = {
  id: string;
  copy: Record<SiteLocale, { title: string; description: string }>;
  stops?: { name: string; note: Record<SiteLocale, string> }[];
};

export type FilledTranslations = { routes: number; stops: number };

/**
 * Writes the seed file's copy for the locales an existing route has no row in, and nothing else.
 *
 * The seeds leave an existing route alone because the editors own it after the first run. That
 * also meant a language added later never reached a database that already had the routes, which
 * is every real one. A missing row is not an editor's choice, so it is filled; a present one,
 * whatever it says, is kept.
 *
 * A stop is matched on its route and name, since the file has no stop ids and editors reorder.
 */
export async function fillMissingRouteTranslations(
  db: Database,
  routes: SeededRouteCopy[],
  { apply }: { apply: boolean },
): Promise<FilledTranslations> {
  const ids = routes.map((route) => route.id);
  if (ids.length === 0) return { routes: 0, stops: 0 };

  const present = await db
    .select({
      routeId: suggestedRouteTranslation.routeId,
      locale: suggestedRouteTranslation.locale,
    })
    .from(suggestedRouteTranslation)
    .where(inArray(suggestedRouteTranslation.routeId, ids));
  const hasRoute = new Set(present.map((row) => `${row.routeId}:${row.locale}`));

  const routeRows = routes.flatMap((route) =>
    SITE_LOCALES.filter((locale) => !hasRoute.has(`${route.id}:${locale}`)).map((locale) => ({
      routeId: route.id,
      locale,
      title: route.copy[locale].title,
      description: route.copy[locale].description,
    })),
  );

  const stops = await db
    .select({
      id: suggestedRouteStop.id,
      routeId: suggestedRouteStop.routeId,
      name: suggestedRouteStop.name,
    })
    .from(suggestedRouteStop)
    .where(inArray(suggestedRouteStop.routeId, ids));
  const stopIds = stops.map((stop) => stop.id);
  const presentNotes =
    stopIds.length === 0
      ? []
      : await db
          .select({
            stopId: suggestedRouteStopTranslation.stopId,
            locale: suggestedRouteStopTranslation.locale,
          })
          .from(suggestedRouteStopTranslation)
          .where(inArray(suggestedRouteStopTranslation.stopId, stopIds));
  const hasNote = new Set(presentNotes.map((row) => `${row.stopId}:${row.locale}`));

  const notesByRoute = new Map(
    routes.map((route) => [
      route.id,
      new Map((route.stops ?? []).map((stop) => [stop.name, stop.note])),
    ]),
  );
  const stopRows = stops.flatMap((stop) => {
    const note = notesByRoute.get(stop.routeId)?.get(stop.name);
    if (!note) return [];
    return TRANSLATED_LOCALES.filter((locale) => !hasNote.has(`${stop.id}:${locale}`)).map(
      (locale) => ({ stopId: stop.id, locale, note: note[locale] }),
    );
  });

  if (apply) {
    if (routeRows.length > 0) {
      await db
        .insert(suggestedRouteTranslation)
        .values(routeRows)
        .onConflictDoNothing({
          target: [suggestedRouteTranslation.routeId, suggestedRouteTranslation.locale],
        });
    }
    if (stopRows.length > 0) {
      await db
        .insert(suggestedRouteStopTranslation)
        .values(stopRows)
        .onConflictDoNothing({
          target: [suggestedRouteStopTranslation.stopId, suggestedRouteStopTranslation.locale],
        });
    }
  }

  return { routes: routeRows.length, stops: stopRows.length };
}
