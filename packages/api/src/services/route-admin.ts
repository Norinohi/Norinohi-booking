import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import {
  baseExists,
  countRouteTargets,
  findRouteStop,
  findRouteTarget,
  listExistingRouteIds,
  listFeaturedRouteTargets,
  listRouteStopRows,
  listRouteTargets,
  listRouteTranslationRows,
  listStopNoteRows,
  nextRouteStopSortOrder,
  regionExists,
  renumberRouteStops,
  writeRouteStopNotes,
  writeRouteTranslations,
  type RouteTargetRow,
} from "@yacht-charter/db/routes/library";
import { suggestedRoute, suggestedRouteStop } from "@yacht-charter/db/schema/route";
import { baseLabel, facetTranslator } from "@yacht-charter/db/search/localize";
import type { FacetMediaKind, FacetTranslator } from "@yacht-charter/db/search";
import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import {
  ROUTE_LOCALES,
  ROUTE_STOP_NOTE_LOCALES,
  routeStopNoteLocaleSchema,
} from "../contracts/route";
import type {
  routeCreateInputSchema,
  routeFeaturedReorderInputSchema,
  routeListInputSchema,
  routeListSchema,
  routeSchema,
  routeStopCreateInputSchema,
  routeStopReorderInputSchema,
  routeStopUpdateInputSchema,
  routeUpdateInputSchema,
} from "../contracts/route";
import { writeAuditLog } from "./audit";
import { paginatedQuery, totalFrom } from "./pagination";
import { ConflictError, InternalError, NotFoundError } from "../errors";

type ListInput = z.infer<typeof routeListInputSchema>;
type ListResult = z.infer<typeof routeListSchema>;
type Route = z.infer<typeof routeSchema>;
type Stop = Route["stops"][number];
type CreateInput = z.infer<typeof routeCreateInputSchema>;
type UpdateInput = z.infer<typeof routeUpdateInputSchema>;
type StopCreateInput = z.infer<typeof routeStopCreateInputSchema>;
type StopUpdateInput = z.infer<typeof routeStopUpdateInputSchema>;
type ReorderInput = z.infer<typeof routeStopReorderInputSchema>;
type FeaturedReorderInput = z.infer<typeof routeFeaturedReorderInputSchema>;
type StopNoteTranslation = Stop["noteTranslations"][number];
type Translation = Route["translations"][number];

type TargetRow = RouteTargetRow;

/**
 * "Marina Kaštela · Split · Croatia" for a base route, "Ionian · Greece" for a region one.
 *
 * A repeated name is dropped rather than printed twice: NauSYS models a location as the marina
 * itself, so a base and its location routinely carry the same string ("ACI Marina Trogir"), and
 * a label saying it twice reads as a rendering fault.
 */
function targetLabel(row: TargetRow, translate?: FacetTranslator): string {
  const as = (kind: FacetMediaKind, value: string | null) =>
    value !== null && translate ? translate(kind, value) : value;
  const parts = row.baseName
    ? [
        translate && row.locationName
          ? baseLabel(translate, row.baseName, row.locationName)
          : row.baseName,
        as("location", row.locationName),
        as("region", row.baseRegionName),
        as("country", row.baseCountryName),
      ]
    : [as("region", row.regionName), as("country", row.regionCountryName)];

  const named: string[] = [];
  for (const part of parts) {
    if (part && !named.includes(part)) named.push(part);
  }

  return named.length > 0 ? named.join(" · ") : "Unknown target";
}

function toRoute(
  row: TargetRow,
  stops: Stop[],
  translations: Translation[] = [],
  translate?: FacetTranslator,
): Route {
  const present = new Set(translations.map((entry) => entry.locale));
  return {
    id: row.route.id,
    baseId: row.route.baseId,
    regionId: row.route.regionId,
    targetLabel: targetLabel(row, translate),
    targetPoint:
      row.baseLat !== null && row.baseLng !== null ? { lat: row.baseLat, lng: row.baseLng } : null,
    title: row.route.title,
    kind: row.route.kind,
    nights: row.route.nights,
    description: row.route.description,
    sortOrder: row.route.sortOrder,
    active: row.route.active,
    featuredRank: row.route.featuredRank,
    imageUrl: row.route.imageUrl,
    cloudinaryId: row.route.cloudinaryId,
    difficulty: row.route.difficulty,
    translations,
    missingLocales: ROUTE_LOCALES.filter((locale) => !present.has(locale)),
    stops,
    createdAt: row.route.createdAt.toISOString(),
  };
}

/* Every route's copy, keyed by route. */
async function translationsByRoute(
  db: Database,
  routeIds: string[],
): Promise<Map<string, Translation[]>> {
  const byRoute = new Map<string, Translation[]>();
  if (routeIds.length === 0) return byRoute;

  const rows = await listRouteTranslationRows(db, routeIds);

  for (const row of rows) {
    const parsed = ROUTE_LOCALES.find((locale) => locale === row.locale);
    /* A locale the build no longer declares is skipped rather than surfaced: the column is text
       so a language can be added as data, which also means one can be removed from the app while
       its rows are still there, and a pane for it would have nowhere to render. */
    if (!parsed) continue;

    const list = byRoute.get(row.routeId) ?? [];
    list.push({ locale: parsed, title: row.title, description: row.description });
    byRoute.set(row.routeId, list);
  }

  return byRoute;
}

async function stopsByRoute(db: Database, routeIds: string[]): Promise<Map<string, Stop[]>> {
  const byRoute = new Map<string, Stop[]>();
  if (routeIds.length === 0) return byRoute;

  const rows = await listRouteStopRows(db, routeIds);

  const notesByStop = await stopNotesByStop(
    db,
    rows.map((row) => row.id),
  );

  for (const row of rows) {
    const list = byRoute.get(row.routeId) ?? [];
    const noteTranslations = notesByStop.get(row.id) ?? [];
    const written = new Set(noteTranslations.map((entry) => entry.locale));
    list.push({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      sortOrder: row.sortOrder,
      note: row.note,
      noteTranslations,
      missingNoteLocales: ROUTE_STOP_NOTE_LOCALES.filter((locale) => !written.has(locale)),
    });
    byRoute.set(row.routeId, list);
  }

  return byRoute;
}

async function stopNotesByStop(
  db: Database,
  stopIds: string[],
): Promise<Map<string, StopNoteTranslation[]>> {
  const byStop = new Map<string, StopNoteTranslation[]>();
  if (stopIds.length === 0) return byStop;

  const rows = await listStopNoteRows(db, stopIds);

  for (const row of rows) {
    /* The column is text, so a language the admin does not edit -- one a later import adds --
       is skipped rather than widening the contract's enum. */
    const parsed = routeStopNoteLocaleSchema.safeParse(row.locale);
    if (!parsed.success || !row.note) continue;

    const list = byStop.get(row.stopId) ?? [];
    list.push({ locale: parsed.data, note: row.note });
    byStop.set(row.stopId, list);
  }

  return byStop;
}

export async function listRoutes(db: Database, input: ListInput): Promise<ListResult> {
  const filter = {
    query: input.query,
    kind: input.kind,
    active: input.active,
    countryId: input.countryId,
  };

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) => listRouteTargets(db, filter, limit, offset),
    total: async () => totalFrom(await countRouteTargets(db, filter)),
  });

  const routeIds = rows.map((row) => row.route.id);
  const [stops, translations, translate] = await Promise.all([
    stopsByRoute(db, routeIds),
    translationsByRoute(db, routeIds),
    facetTranslator(db, input.locale),
  ]);

  return {
    items: rows.map((row) =>
      toRoute(row, stops.get(row.route.id) ?? [], translations.get(row.route.id) ?? [], translate),
    ),
    pagination,
  };
}

export async function getRoute(db: Database, id: string): Promise<Route> {
  const row = await findRouteTarget(db, id);

  if (!row) throw new NotFoundError({ message: "Unknown route" });

  const [stops, translations] = await Promise.all([
    stopsByRoute(db, [id]),
    translationsByRoute(db, [id]),
  ]);
  return toRoute(row, stops.get(id) ?? [], translations.get(id) ?? []);
}

/** A dangling target would put the route on a page nobody can reach, or on none at all. */
async function assertTargetExists(
  db: Database,
  input: { baseId?: string | null; regionId?: string | null },
) {
  if (input.baseId) {
    if (!(await baseExists(db, input.baseId)))
      throw new NotFoundError({ message: `Unknown base ${input.baseId}` });
  }

  if (input.regionId) {
    if (!(await regionExists(db, input.regionId)))
      throw new NotFoundError({ message: `Unknown region ${input.regionId}` });
  }
}

/*
 * The home page's popular-routes slider and a listing's suggested routes are cached catalog reads,
 * so an edit that could change a card drops them. Not awaited and not reported: the rows are
 * committed before this runs, and an unreachable web app is a stale window rather than a failed
 * save.
 */
function dropCachedRoutes() {
  void revalidateCatalogCache();
}

export async function createRoute(
  db: Database,
  actorUserId: string,
  input: CreateInput,
): Promise<Route> {
  await assertTargetExists(db, input);

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(suggestedRoute)
      .values({
        baseId: input.baseId ?? null,
        regionId: input.regionId ?? null,
        title: input.title,
        kind: input.kind,
        nights: input.nights,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        /* Drafts are the point of the flag: a route with no stops must never reach a listing. */
        active: input.active ?? false,
        imageUrl: input.imageUrl ?? null,
        cloudinaryId: input.cloudinaryId ?? null,
        difficulty: input.difficulty ?? null,
      })
      .returning({ id: suggestedRoute.id });

    if (!created) throw new InternalError();

    if (input.translations) await writeRouteTranslations(tx, created.id, input.translations);

    await writeAuditLog(tx, {
      actorUserId,
      action: "create",
      entityType: "suggested_route",
      entityId: created.id,
      after: input,
    });

    return created.id;
  });

  dropCachedRoutes();
  return getRoute(db, id);
}

export async function updateRoute(
  db: Database,
  actorUserId: string,
  input: UpdateInput,
): Promise<Route> {
  const before = await getRoute(db, input.id);
  await assertTargetExists(db, input);

  await db.transaction(async (tx) => {
    const patch: Partial<typeof suggestedRoute.$inferInsert> = {};
    /* The target is a pair: naming one side has to clear the other or the check constraint,
       which the input schema already speaks for, would be the thing that noticed. */
    if (input.baseId !== undefined || input.regionId !== undefined) {
      patch.baseId = input.baseId ?? null;
      patch.regionId = input.regionId ?? null;
    }
    if (input.title !== undefined) patch.title = input.title;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.nights !== undefined) patch.nights = input.nights;
    if (input.description !== undefined) patch.description = input.description;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.active !== undefined) patch.active = input.active;
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (input.cloudinaryId !== undefined) patch.cloudinaryId = input.cloudinaryId;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty;

    if (input.translations) await writeRouteTranslations(tx, input.id, input.translations);

    if (Object.keys(patch).length > 0) {
      await tx.update(suggestedRoute).set(patch).where(eq(suggestedRoute.id, input.id));
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "suggested_route",
      entityId: input.id,
      before,
      after: input,
    });
  });

  dropCachedRoutes();
  return getRoute(db, input.id);
}

/**
 * The routes on the site-wide popular list, most prominent first.
 *
 * Inactive routes are excluded rather than merely sorted last: `active` is what "this route has
 * stops and may be shown" means, and a featured draft would be a card linking to an empty
 * itinerary. A route deactivated while featured keeps its rank and comes back when it is
 * published again, which is what an editor pulling a card for the afternoon expects.
 */
export async function listFeaturedRoutes(db: Database): Promise<{ routes: Route[] }> {
  const rows = await listFeaturedRouteTargets(db);

  const routeIds = rows.map((row) => row.route.id);
  const [stops, translations] = await Promise.all([
    stopsByRoute(db, routeIds),
    translationsByRoute(db, routeIds),
  ]);

  return {
    routes: rows.map((row) =>
      toRoute(row, stops.get(row.route.id) ?? [], translations.get(row.route.id) ?? []),
    ),
  };
}

/**
 * Replaces the featured list with the routes given, in the order given.
 *
 * The whole list in one write, for the same reason `setPopularFacets` takes one: clearing every
 * rank and laying the new order down means no moment exists in which two routes hold the same
 * one. Ranks come out 1-based and contiguous. An empty list clears the selection, and the home
 * page falls back to whatever it showed before anything was featured.
 */
export async function reorderFeaturedRoutes(
  db: Database,
  actorUserId: string,
  input: FeaturedReorderInput,
): Promise<{ routes: Route[] }> {
  if (new Set(input.ids).size !== input.ids.length) {
    throw new ConflictError({ message: "A route may appear in the list only once" });
  }

  const before = await listFeaturedRoutes(db);

  if (input.ids.length > 0) {
    const known = new Set(await listExistingRouteIds(db, input.ids));
    const missing = input.ids.find((id) => !known.has(id));
    if (missing) throw new NotFoundError({ message: `Unknown route ${missing}` });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(suggestedRoute)
      .set({ featuredRank: null })
      .where(isNotNull(suggestedRoute.featuredRank));

    for (const [index, id] of input.ids.entries()) {
      await tx
        .update(suggestedRoute)
        .set({ featuredRank: index + 1 })
        .where(eq(suggestedRoute.id, id));
    }

    const beforeIds = before.routes.map((route) => route.id);
    const changed = [
      ...input.ids.filter((id) => !beforeIds.includes(id)),
      ...beforeIds.filter((id) => !input.ids.includes(id)),
    ];
    const titles = new Map(before.routes.map((route) => [route.id, route.title]));
    const unseen = input.ids.filter((id) => !titles.has(id));
    if (unseen.length > 0) {
      const rows = await tx
        .select({ id: suggestedRoute.id, title: suggestedRoute.title })
        .from(suggestedRoute)
        .where(inArray(suggestedRoute.id, unseen));
      for (const row of rows) titles.set(row.id, row.title);
    }
    const named = (ids: string[]) => ids.map((id) => ({ id, title: titles.get(id) ?? null }));

    /* The list has no id of its own, so an entry that features or unfeatures one route is filed
       under that route, which is what the audit's ID filter searches. */
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "suggested_route_featured",
      entityId: changed.length === 1 ? changed[0] : undefined,
      before: named(beforeIds),
      after: named(input.ids),
    });
  });

  dropCachedRoutes();
  return listFeaturedRoutes(db);
}

export async function setRouteActive(
  db: Database,
  actorUserId: string,
  id: string,
  active: boolean,
): Promise<Route> {
  const before = await getRoute(db, id);

  /* Publishing a route with nothing on the map would draw a section with no itinerary in it. */
  if (active && before.stops.length === 0) {
    throw new ConflictError({ message: "Add at least one stop before publishing" });
  }

  await db.transaction(async (tx) => {
    await tx.update(suggestedRoute).set({ active }).where(eq(suggestedRoute.id, id));
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "suggested_route",
      entityId: id,
      before: { active: before.active },
      after: { active },
    });
  });

  dropCachedRoutes();
  return getRoute(db, id);
}

export async function deleteRoute(
  db: Database,
  actorUserId: string,
  id: string,
): Promise<{ id: string }> {
  const before = await getRoute(db, id);

  await db.transaction(async (tx) => {
    /* The stops go with it: `suggested_route_stop.route_id` cascades. */
    await tx.delete(suggestedRoute).where(eq(suggestedRoute.id, id));
    await writeAuditLog(tx, {
      actorUserId,
      action: "delete",
      entityType: "suggested_route",
      entityId: id,
      before,
    });
  });

  dropCachedRoutes();
  return { id };
}

/* ------------------------------------------------------------------- stops */

async function loadStop(db: Database, id: string) {
  const row = await findRouteStop(db, id);
  if (!row) throw new NotFoundError({ message: "Unknown stop" });
  return row;
}

export async function createRouteStop(
  db: Database,
  actorUserId: string,
  input: StopCreateInput,
): Promise<Route> {
  await getRoute(db, input.routeId);

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(suggestedRouteStop)
      .values({
        routeId: input.routeId,
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        note: input.note ?? null,
        sortOrder: await nextRouteStopSortOrder(tx, input.routeId),
      })
      .returning({ id: suggestedRouteStop.id });

    if (!created) throw new InternalError();

    if (input.noteTranslations) await writeRouteStopNotes(tx, created.id, input.noteTranslations);

    await writeAuditLog(tx, {
      actorUserId,
      action: "create",
      entityType: "suggested_route_stop",
      entityId: created.id,
      after: input,
    });
  });

  return getRoute(db, input.routeId);
}

export async function updateRouteStop(
  db: Database,
  actorUserId: string,
  input: StopUpdateInput,
): Promise<Route> {
  const before = await loadStop(db, input.id);

  await db.transaction(async (tx) => {
    const patch: Partial<typeof suggestedRouteStop.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.lat !== undefined) patch.lat = input.lat;
    if (input.lng !== undefined) patch.lng = input.lng;
    if (input.note !== undefined) patch.note = input.note;

    if (Object.keys(patch).length > 0) {
      await tx.update(suggestedRouteStop).set(patch).where(eq(suggestedRouteStop.id, input.id));
    }

    if (input.noteTranslations) await writeRouteStopNotes(tx, input.id, input.noteTranslations);

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "suggested_route_stop",
      entityId: input.id,
      before: { name: before.name, lat: before.lat, lng: before.lng, note: before.note },
      after: input,
    });
  });

  return getRoute(db, before.routeId);
}

export async function deleteRouteStop(
  db: Database,
  actorUserId: string,
  id: string,
): Promise<Route> {
  const before = await loadStop(db, id);

  await db.transaction(async (tx) => {
    await tx.delete(suggestedRouteStop).where(eq(suggestedRouteStop.id, id));

    /* Closes the hole the delete left. Day numbers on the public page are the position in the
       list, so a gap is invisible there — but the next appended stop would land on the vacated
       number and sort into the middle of the itinerary. */
    const remaining = await tx
      .select({ id: suggestedRouteStop.id })
      .from(suggestedRouteStop)
      .where(eq(suggestedRouteStop.routeId, before.routeId))
      .orderBy(asc(suggestedRouteStop.sortOrder));

    await renumberRouteStops(
      tx,
      remaining.map((row) => row.id),
    );

    await writeAuditLog(tx, {
      actorUserId,
      action: "delete",
      entityType: "suggested_route_stop",
      entityId: id,
      before: { name: before.name, lat: before.lat, lng: before.lng, note: before.note },
    });
  });

  return getRoute(db, before.routeId);
}

export async function reorderRouteStops(
  db: Database,
  actorUserId: string,
  input: ReorderInput,
): Promise<Route> {
  const before = await getRoute(db, input.routeId);

  const known = new Set(before.stops.map((stop) => stop.id));
  const submitted = new Set(input.stopIds);
  /* The whole list, or the rows left out would keep positions the reordered ones now want. */
  if (submitted.size !== input.stopIds.length || submitted.size !== known.size) {
    throw new ConflictError({ message: "Reorder must list every stop exactly once" });
  }
  for (const id of input.stopIds) {
    if (!known.has(id)) {
      throw new NotFoundError({ message: `Stop ${id} is not on this route` });
    }
  }

  await db.transaction(async (tx) => {
    await renumberRouteStops(tx, input.stopIds);
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "suggested_route",
      entityId: input.routeId,
      before: { stopIds: before.stops.map((stop) => stop.id) },
      after: { stopIds: input.stopIds },
    });
  });

  return getRoute(db, input.routeId);
}
