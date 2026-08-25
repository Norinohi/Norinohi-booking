import { ORPCError } from "@orpc/server";
import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import { suggestedRoute, suggestedRouteStop } from "@yacht-charter/db/schema/route";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import type {
  routeCreateInputSchema,
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

type ListInput = z.infer<typeof routeListInputSchema>;
type ListResult = z.infer<typeof routeListSchema>;
type Route = z.infer<typeof routeSchema>;
type Stop = Route["stops"][number];
type CreateInput = z.infer<typeof routeCreateInputSchema>;
type UpdateInput = z.infer<typeof routeUpdateInputSchema>;
type StopCreateInput = z.infer<typeof routeStopCreateInputSchema>;
type StopUpdateInput = z.infer<typeof routeStopUpdateInputSchema>;
type ReorderInput = z.infer<typeof routeStopReorderInputSchema>;

/*
 * A route hangs off a base or off a region, and the two reach their country by different paths —
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

type TargetRow = {
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

/**
 * "Marina Kaštela · Split · Croatia" for a base route, "Ionian · Greece" for a region one.
 *
 * A repeated name is dropped rather than printed twice: NauSYS models a location as the marina
 * itself, so a base and its location routinely carry the same string ("ACI Marina Trogir"), and
 * a label saying it twice reads as a rendering fault.
 */
function targetLabel(row: TargetRow): string {
  const parts = row.baseName
    ? [row.baseName, row.locationName, row.baseRegionName, row.baseCountryName]
    : [row.regionName, row.regionCountryName];

  const named: string[] = [];
  for (const part of parts) {
    if (part && !named.includes(part)) named.push(part);
  }

  return named.length > 0 ? named.join(" · ") : "Unknown target";
}

function toRoute(row: TargetRow, stops: Stop[]): Route {
  return {
    id: row.route.id,
    baseId: row.route.baseId,
    regionId: row.route.regionId,
    targetLabel: targetLabel(row),
    targetPoint:
      row.baseLat !== null && row.baseLng !== null ? { lat: row.baseLat, lng: row.baseLng } : null,
    title: row.route.title,
    kind: row.route.kind,
    nights: row.route.nights,
    description: row.route.description,
    sortOrder: row.route.sortOrder,
    active: row.route.active,
    stops,
    createdAt: row.route.createdAt.toISOString(),
  };
}

async function stopsByRoute(db: Database, routeIds: string[]): Promise<Map<string, Stop[]>> {
  const byRoute = new Map<string, Stop[]>();
  if (routeIds.length === 0) return byRoute;

  const rows = await db
    .select()
    .from(suggestedRouteStop)
    .where(inArray(suggestedRouteStop.routeId, routeIds))
    .orderBy(asc(suggestedRouteStop.sortOrder));

  for (const row of rows) {
    const list = byRoute.get(row.routeId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      sortOrder: row.sortOrder,
      note: row.note,
    });
    byRoute.set(row.routeId, list);
  }

  return byRoute;
}

export async function listRoutes(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.query) filters.push(ilike(suggestedRoute.title, `%${input.query}%`));
  if (input.kind) filters.push(eq(suggestedRoute.kind, input.kind));
  if (input.active !== undefined) filters.push(eq(suggestedRoute.active, input.active));
  if (input.countryId) {
    filters.push(or(eq(baseCountry.id, input.countryId), eq(regionCountry.id, input.countryId)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select(targetSelection)
        .from(suggestedRoute)
        .leftJoin(base, eq(base.id, suggestedRoute.baseId))
        .leftJoin(location, eq(location.id, base.locationId))
        .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
        .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
        .leftJoin(region, eq(region.id, suggestedRoute.regionId))
        .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
        .where(where)
        .orderBy(asc(suggestedRoute.sortOrder), desc(suggestedRoute.createdAt))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(
        await db
          .select({ totalItems: count() })
          .from(suggestedRoute)
          .leftJoin(base, eq(base.id, suggestedRoute.baseId))
          .leftJoin(location, eq(location.id, base.locationId))
          .leftJoin(baseRegion, eq(baseRegion.id, location.regionId))
          .leftJoin(baseCountry, eq(baseCountry.id, baseRegion.countryId))
          .leftJoin(region, eq(region.id, suggestedRoute.regionId))
          .leftJoin(regionCountry, eq(regionCountry.id, region.countryId))
          .where(where),
      ),
  });

  const stops = await stopsByRoute(
    db,
    rows.map((row) => row.route.id),
  );

  return {
    items: rows.map((row) => toRoute(row, stops.get(row.route.id) ?? [])),
    pagination,
  };
}

export async function getRoute(db: Database, id: string): Promise<Route> {
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

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown route" });

  const stops = await stopsByRoute(db, [id]);
  return toRoute(row, stops.get(id) ?? []);
}

/** A dangling target would put the route on a page nobody can reach, or on none at all. */
async function assertTargetExists(
  db: Database,
  input: { baseId?: string | null; regionId?: string | null },
) {
  if (input.baseId) {
    const [row] = await db
      .select({ id: base.id })
      .from(base)
      .where(eq(base.id, input.baseId))
      .limit(1);
    if (!row) throw new ORPCError("NOT_FOUND", { message: `Unknown base ${input.baseId}` });
  }

  if (input.regionId) {
    const [row] = await db
      .select({ id: region.id })
      .from(region)
      .where(eq(region.id, input.regionId))
      .limit(1);
    if (!row) throw new ORPCError("NOT_FOUND", { message: `Unknown region ${input.regionId}` });
  }
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
      })
      .returning({ id: suggestedRoute.id });

    if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await writeAuditLog(tx, {
      actorUserId,
      action: "create",
      entityType: "suggested_route",
      entityId: created.id,
      after: input,
    });

    return created.id;
  });

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

  return getRoute(db, input.id);
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
    throw new ORPCError("CONFLICT", { message: "Add at least one stop before publishing" });
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

  return { id };
}

/* ------------------------------------------------------------------- stops */

async function loadStop(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(suggestedRouteStop)
    .where(eq(suggestedRouteStop.id, id))
    .limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown stop" });
  return row;
}

/** Appends: `suggested_route_stop_order_uq` means the new row cannot reuse an existing slot. */
async function nextSortOrder(db: DatabaseExecutor, routeId: string): Promise<number> {
  const [row] = await db
    .select({ highest: sql<number | null>`max(${suggestedRouteStop.sortOrder})` })
    .from(suggestedRouteStop)
    .where(eq(suggestedRouteStop.routeId, routeId));

  return (row?.highest ?? -1) + 1;
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
        sortOrder: await nextSortOrder(tx, input.routeId),
      })
      .returning({ id: suggestedRouteStop.id });

    if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

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

    await renumber(
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

/**
 * Writes positions 0..n-1 in two passes.
 *
 * `suggested_route_stop_order_uq` is a plain unique index, not a deferrable constraint, so it is
 * enforced per statement: moving stop 3 to slot 1 while stop 1 still holds it fails immediately.
 * The first pass parks every row on a negative slot, which nothing else can occupy, and the
 * second lays them down in order.
 */
async function renumber(tx: DatabaseExecutor, orderedIds: string[]): Promise<void> {
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
    throw new ORPCError("CONFLICT", { message: "Reorder must list every stop exactly once" });
  }
  for (const id of input.stopIds) {
    if (!known.has(id)) {
      throw new ORPCError("NOT_FOUND", { message: `Stop ${id} is not on this route` });
    }
  }

  await db.transaction(async (tx) => {
    await renumber(tx, input.stopIds);
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
